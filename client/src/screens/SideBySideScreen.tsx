import { useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useDevices } from '../contexts/DeviceContext';
import { DeviceSelector, DEFAULT_DEVICE_STATE } from '../components/DeviceSelector';
import { ViewportFrame } from '../components/ViewportFrame';
import { SideBySideControls } from '../components/SideBySideControls';
import { toDeviceConfig, toBrowserConfig } from '../utils/deviceConfigAdapter';
import { capture, batchDownload, downloadBlob } from '../utils/ScreenshotCapture';
import type { DeviceSelectorState, PerformanceMetrics, ViewportError, ScreenshotConfig, ScreenshotResult } from '@shared/types';

/** Default right viewport: Samsung Galaxy S24 */
const DEFAULT_RIGHT_STATE: DeviceSelectorState = {
  deviceId: 'galaxy-s24',
  width: 385,
  height: 854,
  dpr: 3,
  browser: 'Samsung Internet',
  orientation: 'portrait',
};

export function SideBySideScreen() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { devices } = useDevices();

  const url = searchParams.get('url') || '';

  // Parse optional left/right query params for pre-configured viewports (from report comparison)
  const initialLeft = (() => {
    const raw = searchParams.get('left');
    if (!raw) return DEFAULT_DEVICE_STATE;
    try {
      const parsed = JSON.parse(raw) as DeviceSelectorState;
      if (parsed.width && parsed.height && parsed.dpr) return parsed;
    } catch { /* ignore parse errors */ }
    return DEFAULT_DEVICE_STATE;
  })();

  const initialRight = (() => {
    const raw = searchParams.get('right');
    if (!raw) return DEFAULT_RIGHT_STATE;
    try {
      const parsed = JSON.parse(raw) as DeviceSelectorState;
      if (parsed.width && parsed.height && parsed.dpr) return parsed;
    } catch { /* ignore parse errors */ }
    return DEFAULT_RIGHT_STATE;
  })();

  const [leftState, setLeftState] = useState<DeviceSelectorState>(initialLeft);
  const [rightState, setRightState] = useState<DeviceSelectorState>(initialRight);

  // Shared zoom: -1 = fit-to-screen (default), positive = explicit zoom level
  const [sharedZoom, setSharedZoom] = useState<number>(-1);
  // Sync scroll toggle (off by default)
  const [syncScroll, setSyncScroll] = useState(false);

  // Screenshot state
  const [screenshots, setScreenshots] = useState<ScreenshotResult[]>([]);
  const [capturingLeft, setCapturingLeft] = useState(false);
  const [capturingRight, setCapturingRight] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const leftViewportRef = useRef<HTMLDivElement>(null);
  const rightViewportRef = useRef<HTMLDivElement>(null);

  // Mirror settings: copy device config from one side to the other
  const handleMirrorSettings = useCallback(
    (direction: 'left-to-right' | 'right-to-left') => {
      if (direction === 'left-to-right') {
        setRightState({ ...leftState });
      } else {
        setLeftState({ ...rightState });
      }
    },
    [leftState, rightState],
  );

  // Shared zoom change handler
  const handleSharedZoomChange = useCallback((zoom: number) => {
    setSharedZoom(zoom);
  }, []);

  // Sync scroll change handler
  const handleSyncScrollChange = useCallback((enabled: boolean) => {
    setSyncScroll(enabled);
  }, []);

  // Build a ScreenshotConfig from a DeviceSelectorState and device info
  const buildScreenshotConfig = useCallback(
    (state: DeviceSelectorState, deviceConfig: { name: string; dpr: number }): ScreenshotConfig => {
      const w = state.orientation === 'landscape' ? state.height : state.width;
      const h = state.orientation === 'landscape' ? state.width : state.height;
      return {
        deviceName: deviceConfig.name,
        width: w,
        height: h,
        dpr: deviceConfig.dpr,
        orientation: state.orientation,
        browser: state.browser,
        url,
      };
    },
    [url],
  );

  // Convert selector states to ViewportFrame props
  const leftDevice = useMemo(
    () => toDeviceConfig(leftState, devices.find(d => d.id === leftState.deviceId)),
    [leftState, devices],
  );
  const rightDevice = useMemo(
    () => toDeviceConfig(rightState, devices.find(d => d.id === rightState.deviceId)),
    [rightState, devices],
  );
  const leftBrowser = useMemo(() => toBrowserConfig(leftState.browser), [leftState.browser]);
  const rightBrowser = useMemo(() => toBrowserConfig(rightState.browser), [rightState.browser]);

  // Capture screenshot for a viewport
  const handleCapture = useCallback(
    async (side: 'left' | 'right') => {
      const containerRef = side === 'left' ? leftViewportRef : rightViewportRef;
      const state = side === 'left' ? leftState : rightState;
      const deviceConfig = side === 'left' ? leftDevice : rightDevice;
      const setCapturing = side === 'left' ? setCapturingLeft : setCapturingRight;

      const container = containerRef.current?.querySelector('.viewport-container') as HTMLElement | null;
      if (!container) {
        setCaptureError('Could not find viewport container to capture.');
        return;
      }

      setCapturing(true);
      setCaptureError(null);

      try {
        const config = buildScreenshotConfig(state, deviceConfig);
        const result = await capture(container, config);
        setScreenshots((prev) => [...prev, result]);
        // Auto-download the individual screenshot
        downloadBlob(result.blob, result.filename);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Screenshot capture failed';
        setCaptureError(`Capture failed (${side}): ${message}. This may be due to cross-origin iframe restrictions.`);
      } finally {
        setCapturing(false);
      }
    },
    [leftState, rightState, leftDevice, rightDevice, buildScreenshotConfig],
  );

  const handleCaptureLeft = useCallback(() => handleCapture('left'), [handleCapture]);
  const handleCaptureRight = useCallback(() => handleCapture('right'), [handleCapture]);

  // Download all screenshots as ZIP
  const handleDownloadAll = useCallback(async () => {
    if (screenshots.length === 0) return;
    try {
      const zipBlob = await batchDownload(screenshots);
      const slug = url.replace(/https?:\/\//, '').replace(/[^a-zA-Z0-9]/g, '-').slice(0, 40);
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(zipBlob, `screenetic-screenshots-${slug}-${date}.zip`);
    } catch {
      setCaptureError('Failed to create ZIP file.');
    }
  }, [screenshots, url]);

  // No-op handlers for now — metrics/errors can be wired up later
  const handleLoad = useCallback((_metrics: PerformanceMetrics) => {}, []);
  const handleError = useCallback((_error: ViewportError) => {}, []);
  const handleUnresponsive = useCallback(() => {}, []);

  const handleSwitchToReport = useCallback(() => {
    navigate(`/report?url=${encodeURIComponent(url)}`);
  }, [navigate, url]);

  if (!url) {
    return (
      <div className="screen sbs-empty" role="alert">
        <h2>No URL specified</h2>
        <p>Please enter a URL from the home screen to start comparing.</p>
        <button className="btn btn-primary" onClick={() => navigate('/')}>
          Go to URL Entry
        </button>
      </div>
    );
  }

  return (
    <div className="screen sbs-screen">
      {/* Toolbar */}
      <div className="sbs-toolbar">
        <h2 className="sbs-title">Side-by-Side Comparison</h2>
        <span className="sbs-url" title={url}>{url}</span>
        <button className="btn btn-primary sbs-report-btn" onClick={handleSwitchToReport}>
          📊 Switch to Report Mode
        </button>
      </div>

      {/* Viewports */}
      <div className="sbs-viewports">
        {/* Left viewport */}
        <section className="sbs-panel" aria-label="Left viewport">
          <DeviceSelector value={leftState} onChange={setLeftState} label="Left device" />
          <div className="sbs-viewport-wrapper" ref={leftViewportRef}>
            <ViewportFrame
              url={url}
              device={leftDevice}
              browser={leftBrowser}
              orientation={leftState.orientation}
              zoom={sharedZoom}
              onLoad={handleLoad}
              onError={handleError}
              onUnresponsive={handleUnresponsive}
            />
          </div>
          <button
            className="btn sbs-capture-btn"
            onClick={handleCaptureLeft}
            disabled={capturingLeft}
            aria-label={`Capture screenshot of ${leftDevice.name} viewport`}
            title="Capture screenshot"
          >
            {capturingLeft ? '⏳ Capturing…' : '📷 Capture Screenshot'}
          </button>
        </section>

        {/* Right viewport */}
        <section className="sbs-panel" aria-label="Right viewport">
          <DeviceSelector value={rightState} onChange={setRightState} label="Right device" />
          <div className="sbs-viewport-wrapper" ref={rightViewportRef}>
            <ViewportFrame
              url={url}
              device={rightDevice}
              browser={rightBrowser}
              orientation={rightState.orientation}
              zoom={sharedZoom}
              onLoad={handleLoad}
              onError={handleError}
              onUnresponsive={handleUnresponsive}
            />
          </div>
          <button
            className="btn sbs-capture-btn"
            onClick={handleCaptureRight}
            disabled={capturingRight}
            aria-label={`Capture screenshot of ${rightDevice.name} viewport`}
            title="Capture screenshot"
          >
            {capturingRight ? '⏳ Capturing…' : '📷 Capture Screenshot'}
          </button>
        </section>
      </div>

      {/* Screenshot capture error */}
      {captureError && (
        <div className="sbs-capture-error" role="alert">
          <span>⚠️ {captureError}</span>
          <button className="btn" onClick={() => setCaptureError(null)} aria-label="Dismiss error">
            ✕
          </button>
        </div>
      )}

      {/* Download All Screenshots */}
      {screenshots.length > 0 && (
        <div className="sbs-download-all">
          <span className="sbs-screenshot-count">
            {screenshots.length} screenshot{screenshots.length !== 1 ? 's' : ''} captured
          </span>
          <button
            className="btn btn-primary sbs-download-all-btn"
            onClick={handleDownloadAll}
            aria-label="Download all screenshots as ZIP"
          >
            📦 Download All as ZIP
          </button>
        </div>
      )}

      {/* Side-by-Side Controls */}
      <SideBySideControls
        syncScroll={syncScroll}
        onSyncScrollChange={handleSyncScrollChange}
        sharedZoom={sharedZoom}
        onSharedZoomChange={handleSharedZoomChange}
        onMirrorSettings={handleMirrorSettings}
        leftConfig={leftState}
        rightConfig={rightState}
      />

      {/* Browser simulation disclaimer */}
      <p className="sbs-disclaimer" role="note">
        Browser simulation uses user-agent string spoofing and viewport resizing — rendering differences caused by engine-specific behavior (WebKit vs Blink) may not be reflected.
      </p>
    </div>
  );
}
