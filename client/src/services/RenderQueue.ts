import type {
  DeviceSelectorState,
  QueuedDevice,
  QueueProgress,
  DeviceConfig,
  PerformanceMetrics,
  DetectedIssue,
} from '@shared/types';
import { capture } from '../utils/ScreenshotCapture';
import { analyze } from '../utils/IssueDetector';
import { collectMetrics } from '../utils/PerfCollector';
import { annotate } from '../utils/AnnotationRenderer';
import { prepareForRender, getCacheMode } from './CacheManager';

// Re-export CacheManager utilities for external use
export { getCacheMode, setCacheMode, prepareForRender } from './CacheManager';

// ===== Constants =====

/** Global report timeout: 30 minutes */
export const REPORT_TIMEOUT_MS = 30 * 60 * 1000;

/** Per-device load timeout: 30 seconds */
export const DEVICE_LOAD_TIMEOUT_MS = 30_000;

/** Settling time after load for dynamic content: 2 seconds */
export const SETTLING_TIME_MS = 2_000;

// Re-export persistence utilities for external use
export {
  saveReportProgress,
  loadReportProgress,
  deleteReportProgress,
  saveScreenshotBlob,
  loadScreenshotBlob,
  deleteAllScreenshots,
  purgeExpiredProgress,
  MAX_RETRY_COUNT,
} from './ReportPersistence';

import {
  saveReportProgress,
  deleteReportProgress,
  deleteAllScreenshots,
  saveScreenshotBlob,
  canRetryDevice,
} from './ReportPersistence';
import type { PersistedQueueState } from './ReportPersistence';
export type { PersistedQueueState } from './ReportPersistence';

// ===== Pure helpers (exported for testing) =====

/**
 * Calculate estimated remaining time based on elapsed time and progress.
 * Returns null if fewer than 2 devices have completed (not enough data).
 */
export function calculateEstimatedRemaining(
  completedCount: number,
  totalCount: number,
  elapsedMs: number,
): number | null {
  if (completedCount < 2 || completedCount >= totalCount) return null;
  const avgTimePerDevice = elapsedMs / completedCount;
  const remaining = totalCount - completedCount;
  return Math.round(avgTimePerDevice * remaining);
}

/**
 * Build a device display name from a DeviceSelectorState.
 */
export function getDeviceDisplayName(config: DeviceSelectorState): string {
  const w = config.orientation === 'landscape' ? config.height : config.width;
  const h = config.orientation === 'landscape' ? config.width : config.height;
  return `${config.deviceId ?? 'Custom'} (${w}×${h} @${config.dpr}x ${config.browser})`;
}

/**
 * Build a QueueProgress snapshot from current queue state.
 */
export function buildProgress(
  devices: QueuedDevice[],
  startTime: number,
  currentDeviceName: string,
  currentStage: string,
): QueueProgress {
  const completed = devices.filter(
    (d) => d.status === 'complete' || d.status === 'failed' || d.status === 'skipped',
  ).length;
  const total = devices.length;
  const elapsedMs = Date.now() - startTime;
  return {
    completed,
    total,
    currentDevice: currentDeviceName,
    currentStage,
    elapsedMs,
    estimatedRemainingMs: calculateEstimatedRemaining(completed, total, elapsedMs),
  };
}

/**
 * Convert a DeviceSelectorState to a DeviceConfig for use with IssueDetector.
 */
export function toDeviceConfig(state: DeviceSelectorState): DeviceConfig {
  return {
    id: state.deviceId ?? 'custom',
    name: state.deviceId ?? 'Custom Device',
    manufacturer: 'Unknown',
    cssWidth: state.orientation === 'landscape' ? state.height : state.width,
    cssHeight: state.orientation === 'landscape' ? state.width : state.height,
    dpr: state.dpr,
    category: 'phone',
    defaultBrowser: state.browser,
    releaseYear: new Date().getFullYear(),
  };
}

// IndexedDB persistence is now handled by ReportPersistence module

// ===== Iframe management =====

function createHiddenIframe(
  url: string,
  width: number,
  height: number,
  userAgent: string,
): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.sandbox.add('allow-scripts', 'allow-same-origin', 'allow-forms');
  iframe.style.position = 'fixed';
  iframe.style.left = '-9999px';
  iframe.style.top = '-9999px';
  iframe.style.width = `${width}px`;
  iframe.style.height = `${height}px`;
  iframe.style.border = 'none';
  iframe.style.visibility = 'hidden';
  iframe.setAttribute('data-screenetic-render', 'true');
  // User-agent can't be set on iframe directly; it's handled by the browser config
  // The userAgent param is kept for future use / labeling
  void userAgent;
  iframe.src = url;
  document.body.appendChild(iframe);
  return iframe;
}

function destroyIframe(iframe: HTMLIFrameElement): void {
  try {
    iframe.src = 'about:blank';
    iframe.remove();
  } catch {
    // Best-effort cleanup
  }
}

function waitForIframeLoad(
  iframe: HTMLIFrameElement,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`Device load timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    iframe.addEventListener(
      'load',
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve();
        }
      },
      { once: true },
    );

    iframe.addEventListener(
      'error',
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error('Iframe failed to load'));
        }
      },
      { once: true },
    );
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


// ===== RenderQueue class =====

export type RenderQueueStatus = 'idle' | 'running' | 'paused' | 'complete';

export class RenderQueue {
  devices: QueuedDevice[] = [];
  concurrency: number = 1; // 1 (sequential) or 3 (accelerated)
  status: RenderQueueStatus = 'idle';
  onProgress: (progress: QueueProgress) => void = () => {};

  private _url: string = '';
  private _startTime: number = 0;
  private _globalTimer: ReturnType<typeof setTimeout> | null = null;
  private _timedOut: boolean = false;
  private _cancelled: boolean = false;
  private _sessionId: string = '';
  private _startedAt: string = '';
  private _activeIframes: Set<HTMLIFrameElement> = new Set();

  // ===== Public API =====

  enqueue(device: DeviceSelectorState): void {
    this.devices.push({
      config: device,
      status: 'queued',
      result: null,
      error: null,
      retryCount: 0,
    });
  }

  async start(url: string): Promise<void> {
    if (this.status === 'running') return;

    this._url = url;
    this._startTime = Date.now();
    this._timedOut = false;
    this._cancelled = false;
    this._sessionId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this._startedAt = new Date().toISOString();
    this.status = 'running';

    // Start 30-minute global timeout
    this._globalTimer = setTimeout(() => {
      this._timedOut = true;
    }, REPORT_TIMEOUT_MS);

    try {
      if (this.concurrency <= 1) {
        await this._processSequential();
      } else {
        await this._processConcurrent();
      }
    } finally {
      this._cleanup();
    }
  }

  /**
   * Resume from a persisted queue state. Skips completed devices and continues
   * from the saved queueIndex.
   */
  async resumeFrom(state: PersistedQueueState): Promise<void> {
    if (this.status === 'running') return;

    this._url = state.url;
    this._startTime = Date.now();
    this._timedOut = false;
    this._cancelled = false;
    // Extract sessionId from the persisted key
    this._sessionId = state.id.replace('screenetic_report_progress_', '');
    this._startedAt = state.startedAt;
    this.status = 'running';

    // Restore device list from persisted state
    this.devices = state.devices;

    // Start 30-minute global timeout
    this._globalTimer = setTimeout(() => {
      this._timedOut = true;
    }, REPORT_TIMEOUT_MS);

    try {
      if (this.concurrency <= 1) {
        await this._processSequential();
      } else {
        await this._processConcurrent();
      }
    } finally {
      this._cleanup();
    }
  }

  cancel(): void {
    this._cancelled = true;
    // Destroy any active iframes
    for (const iframe of this._activeIframes) {
      destroyIframe(iframe);
    }
    this._activeIframes.clear();
    this._cleanup();

    // Mark remaining queued devices as skipped
    for (const device of this.devices) {
      if (device.status === 'queued') {
        device.status = 'skipped';
        device.error = 'Cancelled by user';
      }
    }

    this.status = 'complete';
    this._emitProgress('', 'cancelled');
  }

  retryFailed(): void {
    for (const device of this.devices) {
      if (canRetryDevice(device)) {
        device.status = 'queued';
        device.error = null;
      }
    }
  }

  // ===== Private processing =====

  private async _processSequential(): Promise<void> {
    for (let i = 0; i < this.devices.length; i++) {
      if (this._cancelled || this._timedOut) break;

      const device = this.devices[i];
      if (device.status !== 'queued') continue;

      await this._processDevice(device);
      await this._persistProgress(i + 1);
    }

    this._finalizeReport();
  }

  private async _processConcurrent(): Promise<void> {
    const maxConcurrency = Math.min(this.concurrency, 3);
    let nextIndex = 0;

    const processNext = async (): Promise<void> => {
      while (nextIndex < this.devices.length) {
        if (this._cancelled || this._timedOut) return;

        const idx = nextIndex++;
        const device = this.devices[idx];
        if (device.status !== 'queued') continue;

        await this._processDevice(device);
        await this._persistProgress(idx + 1);
      }
    };

    // Launch up to maxConcurrency workers
    const workers: Promise<void>[] = [];
    for (let w = 0; w < maxConcurrency; w++) {
      workers.push(processNext());
    }
    await Promise.all(workers);

    this._finalizeReport();
  }

  /**
   * Persist progress after each device completes, including screenshot blobs.
   */
  private async _persistProgress(queueIndex: number): Promise<void> {
    // Save screenshot blobs separately for completed devices
    for (const device of this.devices) {
      if (device.status === 'complete' && device.result) {
        const deviceId = device.config.deviceId ?? 'custom';
        await saveScreenshotBlob(deviceId, this._sessionId, device.result.screenshotBlob);
      }
    }

    await saveReportProgress(
      this._sessionId,
      this._url,
      this.devices,
      '', // networkProfile — set by caller if needed
      '', // cpuProfile — set by caller if needed
      this._startedAt,
      queueIndex,
    );
  }

  private async _processDevice(device: QueuedDevice): Promise<void> {
    const deviceName = getDeviceDisplayName(device.config);
    const deviceConfig = toDeviceConfig(device.config);
    const w = deviceConfig.cssWidth;
    const h = deviceConfig.cssHeight;
    const startMs = Date.now();

    let iframe: HTMLIFrameElement | null = null;

    try {
      // --- Loading phase ---
      device.status = 'loading';
      this._emitProgress(deviceName, 'loading');

      const prepResult = await prepareForRender(this._url);

      iframe = createHiddenIframe(this._url, w, h, device.config.browser);
      this._activeIframes.add(iframe);

      await waitForIframeLoad(iframe, DEVICE_LOAD_TIMEOUT_MS);

      // --- Settling phase ---
      device.status = 'settling';
      this._emitProgress(deviceName, 'settling');
      await delay(SETTLING_TIME_MS);

      // --- Capturing phase ---
      device.status = 'capturing';
      this._emitProgress(deviceName, 'capturing');

      // Capture screenshot using the iframe's parent container (the iframe itself for hidden rendering)
      const screenshotConfig = {
        deviceName: deviceConfig.name,
        width: w,
        height: h,
        dpr: device.config.dpr,
        orientation: device.config.orientation,
        browser: device.config.browser,
        url: this._url,
      };

      const screenshotResult = await capture(iframe, screenshotConfig);

      // --- Analyzing phase ---
      device.status = 'analyzing';
      this._emitProgress(deviceName, 'analyzing');

      let issues: DetectedIssue[] = [];
      let metrics: PerformanceMetrics;

      try {
        issues = await analyze(iframe, deviceConfig);
      } catch {
        // Issue detection failed — continue with empty issues
      }

      try {
        metrics = await collectMetrics(iframe, getCacheMode());
      } catch {
        metrics = {
          loadTimeMs: null,
          fcpMs: null,
          lcpMs: null,
          cls: null,
          resourceCount: null,
          transferSizeKB: null,
          cacheMode: getCacheMode(),
          serviceWorkerActive: !prepResult.swUnregistered,
          label: 'Simulated',
        };
      }

      // Annotate screenshot with issues
      let annotatedBlob: Blob;
      try {
        annotatedBlob = await annotate(screenshotResult.blob, issues);
      } catch {
        annotatedBlob = screenshotResult.blob; // fallback to raw screenshot
      }

      const renderTimeMs = Date.now() - startMs;

      device.result = {
        screenshotBlob: screenshotResult.blob,
        screenshotAnnotatedBlob: annotatedBlob,
        metrics,
        issues,
        renderTimeMs,
      };
      device.status = 'complete';
      this._emitProgress(deviceName, 'complete');
    } catch (err) {
      device.status = 'failed';
      device.error =
        err instanceof Error ? err.message : 'Unknown error during device rendering';
      device.retryCount++;
      this._emitProgress(deviceName, 'failed');
    } finally {
      if (iframe) {
        this._activeIframes.delete(iframe);
        destroyIframe(iframe);
      }
    }
  }

  private _finalizeReport(): void {
    if (this._timedOut) {
      // Mark remaining queued devices as skipped
      for (const device of this.devices) {
        if (device.status === 'queued') {
          device.status = 'skipped';
          device.error = 'Skipped — report time limit reached';
        }
      }
    }

    this.status = 'complete';
    this._emitProgress('', 'complete');

    // Clean up persisted progress and screenshots on completion
    deleteReportProgress(this._sessionId).catch(() => {});
    deleteAllScreenshots(this._sessionId).catch(() => {});
  }

  private _cleanup(): void {
    if (this._globalTimer) {
      clearTimeout(this._globalTimer);
      this._globalTimer = null;
    }
  }

  private _emitProgress(deviceName: string, stage: string): void {
    try {
      this.onProgress(
        buildProgress(this.devices, this._startTime, deviceName, stage),
      );
    } catch {
      // Don't let callback errors break the queue
    }
  }
}
