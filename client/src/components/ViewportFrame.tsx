import { useRef, useEffect, useCallback, useState } from 'react';
import type { DeviceConfig, BrowserConfig, PerformanceMetrics, ViewportError } from '@shared/types';
import { createTouchEventProxy, type ScrollMode } from '../utils/TouchEventProxy';
import { ViewportErrorDisplay } from './ViewportErrorDisplay';

export interface ViewportFrameProps {
  url: string;
  device: DeviceConfig;
  browser: BrowserConfig;
  orientation: 'portrait' | 'landscape';
  zoom: number; // shared zoom from parent (0.25 - 2.0), or -1 for "fit"
  onLoad: (metrics: PerformanceMetrics) => void;
  onError: (error: ViewportError) => void;
  onUnresponsive: () => void;
}

const HEARTBEAT_INTERVAL_MS = 5000;
const HEARTBEAT_TIMEOUT_MS = 10000;

/** Time to wait for iframe load/heartbeat before assuming X-Frame-Options/CSP block */
const IFRAME_BLOCK_DETECTION_MS = 5000;
/** General load timeout — abort if page hasn't loaded after this */
const LOAD_TIMEOUT_MS = 30000;

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.25;

/**
 * Script injected into same-origin iframes to:
 * 1. Suppress alert/confirm/prompt dialogs
 * 2. Send heartbeat pings to the parent
 * 3. Listen for Escape key and notify parent
 */
const INJECTION_SCRIPT = `
(function() {
  // Suppress modal dialogs
  window.alert = function() {};
  window.confirm = function() { return false; };
  window.prompt = function() { return null; };

  // Heartbeat: post a message to parent every 5 seconds
  setInterval(function() {
    try {
      window.parent.postMessage({ type: 'screenetic-heartbeat' }, '*');
    } catch(e) {}
  }, ${HEARTBEAT_INTERVAL_MS});

  // Escape key: notify parent to release focus
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      try {
        window.parent.postMessage({ type: 'escape-focus' }, '*');
      } catch(e) {}
    }
  });
})();
`;

/**
 * Build a script that emulates DPR inside the iframe by overriding
 * window.devicePixelRatio and injecting a CSS media override.
 */
function buildDprEmulationScript(dpr: number): string {
  return `
(function() {
  try {
    Object.defineProperty(window, 'devicePixelRatio', {
      get: function() { return ${dpr}; },
      configurable: true
    });
  } catch(e) {}

  try {
    var style = document.createElement('style');
    style.textContent = '@media (-webkit-min-device-pixel-ratio: ${dpr}), (min-resolution: ${dpr * 96}dpi) {}';
    (document.head || document.documentElement).appendChild(style);
  } catch(e) {}
})();
`;
}

/** Compute the zoom factor that fits the viewport within a container. */
export function computeFitZoom(
  deviceWidth: number,
  deviceHeight: number,
  containerWidth: number,
  containerHeight: number,
): number {
  if (containerWidth <= 0 || containerHeight <= 0 || deviceWidth <= 0 || deviceHeight <= 0) {
    return 1;
  }
  const scaleX = containerWidth / deviceWidth;
  const scaleY = containerHeight / deviceHeight;
  const fit = Math.min(scaleX, scaleY);
  // Clamp to valid range
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fit));
}

/** Clamp a zoom value to the valid range. */
function clampZoom(z: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}

export function ViewportFrame({
  url,
  device,
  browser,
  orientation,
  zoom: parentZoom,
  onLoad,
  onError,
  onUnresponsive,
}: ViewportFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const deviceSelectorRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeBlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isCrossOrigin, setIsCrossOrigin] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [viewportError, setViewportError] = useState<ViewportError | null>(null);
  /** Tracks whether we've received any signal (load or heartbeat) from the iframe */
  const receivedSignalRef = useRef(false);

  // Per-viewport zoom state: null means "follow parent zoom"
  const [localZoom, setLocalZoom] = useState<number | null>(null);
  // Whether we're in "fit to space" mode
  const [fitMode, setFitMode] = useState(true);
  // Computed fit zoom based on container size
  const [fitZoomValue, setFitZoomValue] = useState(1);

  // Touch event simulation
  const [scrollMode, setScrollMode] = useState<ScrollMode>('wheel');
  const touchProxyRef = useRef<{ detach: () => void; updateScale: (s: number) => void } | null>(null);

  const width = orientation === 'landscape' ? device.cssHeight : device.cssWidth;
  const height = orientation === 'landscape' ? device.cssWidth : device.cssHeight;
  const simulationLabel = browser.isNative ? 'native' : 'UA simulation';

  // Determine the effective zoom
  const effectiveZoom = fitMode
    ? fitZoomValue
    : localZoom !== null
      ? localZoom
      : clampZoom(parentZoom);

  // Measure container and compute fit zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateFitZoom = () => {
      const parent = container.parentElement;
      if (!parent) return;
      // Use the parent's available space (minus some padding for controls)
      const rect = parent.getBoundingClientRect();
      const availW = rect.width - 24; // account for padding
      const availH = rect.height - 120; // account for header/footer/controls
      const fit = computeFitZoom(width, height, availW, availH);
      setFitZoomValue(fit);
    };

    updateFitZoom();

    const observer = new ResizeObserver(updateFitZoom);
    observer.observe(container.parentElement || container);
    return () => observer.disconnect();
  }, [width, height]);

  // Reset to fit mode when parent zoom changes (shared zoom reset)
  useEffect(() => {
    if (parentZoom === -1) {
      setFitMode(true);
      setLocalZoom(null);
    }
  }, [parentZoom]);

  // Zoom control handlers
  const handleZoomIn = useCallback(() => {
    setFitMode(false);
    setLocalZoom((prev: number | null) => clampZoom((prev ?? effectiveZoom) + ZOOM_STEP));
  }, [effectiveZoom]);

  const handleZoomOut = useCallback(() => {
    setFitMode(false);
    setLocalZoom((prev: number | null) => clampZoom((prev ?? effectiveZoom) - ZOOM_STEP));
  }, [effectiveZoom]);

  const handleFitToSpace = useCallback(() => {
    setFitMode(true);
    setLocalZoom(null);
  }, []);

  const handleResetZoom = useCallback(() => {
    setFitMode(false);
    setLocalZoom(1.0);
  }, []);

  const handleToggleScrollMode = useCallback(() => {
    setScrollMode((prev: ScrollMode) => (prev === 'wheel' ? 'drag' : 'wheel'));
  }, []);

  /** Clear all detection/timeout timers */
  const clearAllTimers = useCallback(() => {
    if (iframeBlockTimerRef.current) {
      clearTimeout(iframeBlockTimerRef.current);
      iframeBlockTimerRef.current = null;
    }
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  }, []);

  // Reset heartbeat timeout — called each time we receive a heartbeat
  const resetHeartbeatTimeout = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearTimeout(heartbeatTimerRef.current);
    }
    heartbeatTimerRef.current = setTimeout(() => {
      onUnresponsive();
    }, HEARTBEAT_TIMEOUT_MS);
  }, [onUnresponsive]);

  // Determine if the iframe URL is same-origin
  const checkCrossOrigin = useCallback(() => {
    try {
      const iframeUrl = new URL(url, window.location.href);
      return iframeUrl.origin !== window.location.origin;
    } catch {
      return true;
    }
  }, [url]);

  // Inject suppression + heartbeat + escape + DPR scripts into same-origin iframes
  const injectScripts = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    try {
      const doc = iframe.contentDocument;
      if (!doc) {
        setIsCrossOrigin(true);
        return;
      }

      // Inject the suppression/heartbeat/escape script
      const script = doc.createElement('script');
      script.textContent = INJECTION_SCRIPT;
      (doc.head || doc.documentElement).appendChild(script);

      // Inject DPR emulation script
      const dprScript = doc.createElement('script');
      dprScript.textContent = buildDprEmulationScript(device.dpr);
      (doc.head || doc.documentElement).appendChild(dprScript);

      setIsCrossOrigin(false);
    } catch {
      // SecurityError — cross-origin
      setIsCrossOrigin(true);
    }
  }, [device.dpr]);

  // Handle iframe load event
  const handleLoad = useCallback(() => {
    receivedSignalRef.current = true;
    clearAllTimers();
    setViewportError(null);
    setIsLoaded(true);
    injectScripts();
    resetHeartbeatTimeout();

    // Collect basic performance metrics from the iframe
    const iframe = iframeRef.current;
    const metrics: PerformanceMetrics = {
      loadTimeMs: null,
      fcpMs: null,
      lcpMs: null,
      cls: null,
      resourceCount: null,
      transferSizeKB: null,
      cacheMode: 'cold',
      serviceWorkerActive: false,
      label: 'Simulated',
    };

    try {
      const iframeWindow = iframe?.contentWindow;
      if (iframeWindow && iframeWindow.performance) {
        const timing = iframeWindow.performance.timing;
        if (timing && timing.loadEventEnd > 0) {
          metrics.loadTimeMs = timing.loadEventEnd - timing.navigationStart;
        }
      }
    } catch {
      // Cross-origin — metrics unavailable
    }

    onLoad(metrics);
  }, [clearAllTimers, injectScripts, resetHeartbeatTimeout, onLoad]);

  // Handle iframe error
  const handleError = useCallback(() => {
    clearAllTimers();
    const error: ViewportError = {
      type: 'load-failed',
      message: 'Failed to load the URL in the viewport.',
    };
    setViewportError(error);
    onError(error);
  }, [clearAllTimers, onError]);

  // Listen for postMessage events (heartbeat + escape-focus)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== 'object') return;

      if (event.data.type === 'screenetic-heartbeat') {
        receivedSignalRef.current = true;
        resetHeartbeatTimeout();
      }

      if (event.data.type === 'escape-focus') {
        // Blur the iframe and focus the device selector (next focusable UI element)
        iframeRef.current?.blur();
        const selectorEl = deviceSelectorRef.current;
        if (selectorEl) {
          const focusable = selectorEl.querySelector<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          focusable?.focus();
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      if (heartbeatTimerRef.current) {
        clearTimeout(heartbeatTimerRef.current);
      }
    };
  }, [resetHeartbeatTimeout]);

  // Cross-origin overlay: capture Escape key when overlay is focused
  const handleOverlayKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      iframeRef.current?.blur();
      overlayRef.current?.blur();
      const selectorEl = deviceSelectorRef.current;
      if (selectorEl) {
        const focusable = selectorEl.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        focusable?.focus();
      }
    }
  }, []);

  // Cross-origin overlay: gain focus on click
  const handleOverlayClick = useCallback(() => {
    overlayRef.current?.focus();
  }, []);

  // Determine cross-origin status when URL changes and start detection timers
  useEffect(() => {
    setIsCrossOrigin(checkCrossOrigin());
    setIsLoaded(false);
    setViewportError(null);
    receivedSignalRef.current = false;
    clearAllTimers();

    // 5-second iframe block detection timer
    // If no load event or heartbeat fires within 5s, assume X-Frame-Options/CSP block
    iframeBlockTimerRef.current = setTimeout(() => {
      if (!receivedSignalRef.current) {
        const error: ViewportError = {
          type: 'x-frame-options',
          message: 'This site blocks iframe embedding.',
          details:
            'The page likely uses X-Frame-Options or Content-Security-Policy headers that prevent it from being displayed in an iframe. No load event was received within 5 seconds.',
        };
        setViewportError(error);
        onError(error);
      }
    }, IFRAME_BLOCK_DETECTION_MS);

    // 30-second general load timeout
    loadTimeoutRef.current = setTimeout(() => {
      if (!receivedSignalRef.current) {
        clearAllTimers();
        const error: ViewportError = {
          type: 'timeout',
          message: 'Timed out loading the page.',
          details: 'The page did not finish loading within 30 seconds.',
        };
        setViewportError(error);
        onError(error);
      }
    }, LOAD_TIMEOUT_MS);

    return () => {
      clearAllTimers();
    };
  }, [url, checkCrossOrigin, clearAllTimers, onError]);

  // Attach/detach touch event proxy on the overlay
  useEffect(() => {
    const overlay = overlayRef.current;
    const iframe = iframeRef.current;
    if (!overlay || !iframe || !isLoaded) return;

    // Detach previous proxy if any
    touchProxyRef.current?.detach();

    const proxy = createTouchEventProxy({
      overlay,
      iframe,
      scaleFactor: effectiveZoom,
      scrollMode,
    });
    touchProxyRef.current = proxy;

    return () => {
      proxy.detach();
      touchProxyRef.current = null;
    };
  }, [isLoaded, isCrossOrigin, scrollMode]); // re-attach when these change

  // Keep the touch proxy scale factor in sync with zoom
  useEffect(() => {
    touchProxyRef.current?.updateScale(effectiveZoom);
  }, [effectiveZoom]);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      if (heartbeatTimerRef.current) {
        clearTimeout(heartbeatTimerRef.current);
      }
      clearAllTimers();
    };
  }, [clearAllTimers]);

  const zoomPercent = Math.round(effectiveZoom * 100);
  const isMinZoom = effectiveZoom <= MIN_ZOOM;
  const isMaxZoom = effectiveZoom >= MAX_ZOOM;

  return (
    <div className="viewport-frame" role="region" aria-label={`${device.name} viewport`} ref={containerRef}>
      {/* Device info header */}
      <div className="viewport-header" ref={deviceSelectorRef}>
        <span className="viewport-device-info">
          {device.name} — {width}×{height} @{device.dpr}x — {browser.name} ({simulationLabel})
        </span>
      </div>

      {/* Per-viewport zoom controls */}
      <div className="viewport-zoom-controls" role="toolbar" aria-label="Viewport zoom controls">
        <button
          className="btn viewport-zoom-btn"
          onClick={handleZoomOut}
          disabled={isMinZoom}
          aria-label="Zoom out"
          title="Zoom out"
        >
          −
        </button>
        <span className="viewport-zoom-level" aria-live="polite">
          {zoomPercent}%
        </span>
        <button
          className="btn viewport-zoom-btn"
          onClick={handleZoomIn}
          disabled={isMaxZoom}
          aria-label="Zoom in"
          title="Zoom in"
        >
          +
        </button>
        <button
          className="btn viewport-zoom-btn viewport-zoom-fit"
          onClick={handleFitToSpace}
          aria-label="Fit to available space"
          title="Fit to available space"
          aria-pressed={fitMode}
        >
          Fit
        </button>
        <button
          className="btn viewport-zoom-btn"
          onClick={handleResetZoom}
          aria-label="Reset zoom to 100%"
          title="Reset to 100%"
        >
          1:1
        </button>
      </div>

      {/* Iframe container with scaling */}
      <div
        className="viewport-container"
        style={{
          width: width * effectiveZoom,
          height: height * effectiveZoom,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {viewportError ? (
          <ViewportErrorDisplay
            error={viewportError}
            width={width}
            height={height}
            zoom={effectiveZoom}
          />
        ) : (
          <>
            <iframe
              ref={iframeRef}
              src={url}
              sandbox="allow-scripts allow-same-origin allow-forms"
              title={`${device.name} viewport preview`}
              style={{
                width,
                height,
                border: 'none',
                transform: `scale(${effectiveZoom})`,
                transformOrigin: 'top left',
              }}
              onLoad={handleLoad}
              onError={handleError}
            />

            {/* Touch simulation overlay (always present when loaded) + cross-origin escape capture */}
            {isLoaded && (
              <div
                ref={overlayRef}
                className="viewport-touch-overlay"
                tabIndex={isCrossOrigin ? 0 : -1}
                role={isCrossOrigin ? 'button' : undefined}
                aria-label={
                  isCrossOrigin
                    ? 'Click to focus viewport. Press Escape to return to controls.'
                    : 'Touch simulation overlay'
                }
                onClick={isCrossOrigin ? handleOverlayClick : undefined}
                onKeyDown={handleOverlayKeyDown}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: width * effectiveZoom,
                  height: height * effectiveZoom,
                  background: 'transparent',
                  cursor: isCrossOrigin ? 'pointer' : 'default',
                  zIndex: 1,
                }}
              />
            )}
          </>
        )}
      </div>

      {/* Scale factor label + touch simulation controls */}
      <div className="viewport-footer">
        <span className="viewport-scale-label">
          Viewing at {zoomPercent}% of actual size
        </span>

        {/* Scroll mode toggle */}
        {isLoaded && !isCrossOrigin && (
          <button
            className="btn viewport-scroll-mode-btn"
            onClick={handleToggleScrollMode}
            aria-label={`Scroll mode: ${scrollMode === 'wheel' ? 'Native scroll' : 'Touch swipe'}. Click to toggle.`}
            title={scrollMode === 'wheel' ? 'Scroll mode: Wheel (native scroll)' : 'Scroll mode: Drag (touch swipe)'}
          >
            {scrollMode === 'wheel' ? '🖱 Wheel' : '👆 Drag'}
          </button>
        )}

        {/* Cross-origin touch limitation label */}
        {isLoaded && isCrossOrigin && (
          <span className="viewport-touch-limitation" role="status">
            Touch simulation unavailable (cross-origin page)
          </span>
        )}

        <span className="viewport-escape-hint" aria-live="polite">
          Press Escape to return to controls.
        </span>
      </div>
    </div>
  );
}
