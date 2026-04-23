import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DeviceSelector, DEFAULT_DEVICE_STATE } from '../components/DeviceSelector';
import { ReportProgress } from '../components/ReportProgress';
import { CompareSelector } from '../components/CompareSelector';
import { ReportExportToolbar } from '../components/ReportExportToolbar';
import { UndoToast } from '../components/UndoToast';
import { RenderQueue } from '../services/RenderQueue';
import { useDevices } from '../contexts/DeviceContext';
import { useAuth } from '../contexts/AuthContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useUndoToast } from '../hooks/useUndoToast';
import {
  THROTTLE_PROFILES,
  CPU_PROFILES,
  type DeviceSelectorState,
  type QueuedDevice,
  type QueueProgress,
  type PerformanceMetrics,
  type ReportData,
} from '@shared/types';
import {
  requestNotificationPermission,
  notifyReportComplete,
  updateTitleProgress,
  resetTitle,
  isPageVisible,
} from '../utils/ReportNotifications';

// ===== Constants =====

const ANON_DEVICE_CAP = 25;
const AUTH_DEVICE_CAP = 50;
const MOBILE_DEVICE_CAP = 10;

type Phase = 'config' | 'generating' | 'results';

// ===== Metric formatting helpers =====

function formatMetric(value: number | null, unit: string): string {
  if (value === null || value === undefined) return 'Not available';
  if (unit === 'score') return value.toFixed(3);
  if (unit === 'KB') return `${value.toFixed(1)} KB`;
  if (unit === 'ms') return `${Math.round(value)} ms`;
  if (unit === 'count') return `${value}`;
  return `${value} ${unit}`;
}

function severityBadgeClass(severity: 'issue' | 'observation'): string {
  return severity === 'issue' ? 'rs-badge rs-badge--issue' : 'rs-badge rs-badge--observation';
}

// ===== Component =====

export function ReportScreen() {
  const [searchParams] = useSearchParams();
  const url = searchParams.get('url') || '';
  const { isAuthenticated } = useAuth();
  const { devices: allDevices, autoAuditBaseline } = useDevices();
  const isMobile = useMediaQuery('(max-width: 768px)');

  const deviceCap = isMobile ? MOBILE_DEVICE_CAP : (isAuthenticated ? AUTH_DEVICE_CAP : ANON_DEVICE_CAP);

  // --- Config phase state ---
  const [selectorState, setSelectorState] = useState<DeviceSelectorState>({ ...DEFAULT_DEVICE_STATE });
  const [deviceList, setDeviceList] = useState<DeviceSelectorState[]>([]);
  const [networkProfile, setNetworkProfile] = useState<string>('none');
  const [cpuProfile, setCpuProfile] = useState<string>('high-end');

  // --- Undo / confirmation state ---
  const { toast, showUndo, dismissToast } = useUndoToast();
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // --- Generation phase state ---
  const [phase, setPhase] = useState<Phase>('config');
  const [progress, setProgress] = useState<QueueProgress>({
    completed: 0, total: 0, currentDevice: '', currentStage: '', elapsedMs: 0, estimatedRemainingMs: null,
  });
  const [queueDevices, setQueueDevices] = useState<QueuedDevice[]>([]);
  const queueRef = useRef<RenderQueue | null>(null);

  // --- Results phase state ---
  const [resultDevices, setResultDevices] = useState<QueuedDevice[]>([]);
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [jumpToDevice, setJumpToDevice] = useState<string>('');

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (queueRef.current && queueRef.current.status === 'running') {
        queueRef.current.cancel();
      }
      resetTitle();
    };
  }, []);

  // Reset title when user returns to the tab during results phase
  useEffect(() => {
    if (phase !== 'results') return;

    const handleVisibilityChange = () => {
      if (isPageVisible()) {
        resetTitle();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    // Also reset immediately if already visible when entering results
    if (isPageVisible()) {
      resetTitle();
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [phase]);

  // --- Add device ---
  const handleAddDevice = useCallback(() => {
    if (deviceList.length >= deviceCap) return;
    setDeviceList(prev => [...prev, { ...selectorState }]);
  }, [selectorState, deviceList.length, deviceCap]);

  // --- Device display name ---
  const deviceDisplayName = useCallback((config: DeviceSelectorState): string => {
    const entry = allDevices.find(d => d.id === config.deviceId);
    if (entry) return `${entry.manufacturer} ${entry.model}`;
    return `Custom (${config.width}×${config.height})`;
  }, [allDevices]);

  // --- Remove device (with undo) ---
  const handleRemoveDevice = useCallback((index: number) => {
    setDeviceList(prev => {
      const removed = prev[index];
      const next = prev.filter((_, i) => i !== index);
      showUndo(
        `Removed ${deviceDisplayName(removed)}`,
        () => {
          setDeviceList(current => {
            const restored = [...current];
            restored.splice(index, 0, removed);
            return restored;
          });
        },
      );
      return next;
    });
  }, [showUndo, deviceDisplayName]);

  // --- Clear All (with confirmation) ---
  const handleClearAll = useCallback(() => {
    setShowClearConfirm(true);
  }, []);

  const confirmClearAll = useCallback(() => {
    setDeviceList([]);
    setShowClearConfirm(false);
  }, []);

  const cancelClearAll = useCallback(() => {
    setShowClearConfirm(false);
  }, []);

  // --- Automatic Audit ---
  const handleAutoAudit = useCallback(() => {
    const baselineDevices: DeviceSelectorState[] = [];
    for (const deviceId of autoAuditBaseline) {
      if (baselineDevices.length >= deviceCap) break;
      const entry = allDevices.find(d => d.id === deviceId);
      if (entry) {
        baselineDevices.push({
          deviceId: entry.id,
          width: entry.cssWidth,
          height: entry.cssHeight,
          dpr: entry.dpr,
          browser: entry.defaultBrowser,
          orientation: 'portrait',
        });
      }
    }
    setDeviceList(baselineDevices);
  }, [autoAuditBaseline, allDevices, deviceCap]);

  // --- Generate Report ---
  const handleGenerate = useCallback(async () => {
    if (deviceList.length === 0 || !url) return;

    // Request notification permission at generation start
    requestNotificationPermission();

    const queue = new RenderQueue();
    queueRef.current = queue;

    // On mobile, force sequential mode (concurrency = 1)
    if (isMobile) {
      queue.concurrency = 1;
    }

    for (const device of deviceList) {
      queue.enqueue(device);
    }

    queue.onProgress = (p: QueueProgress) => {
      setProgress(p);
      setQueueDevices([...queue.devices]);
      // Update title bar with progress
      updateTitleProgress(p.completed, p.total);
    };

    setPhase('generating');
    setQueueDevices([...queue.devices]);

    await queue.start(url);

    const finalDevices = [...queue.devices];
    setResultDevices(finalDevices);
    setPhase('results');

    // Show completion in title bar
    updateTitleProgress(finalDevices.length, finalDevices.length);

    // Notify via browser notification if page is in background
    const totalIssues = finalDevices.reduce(
      (sum, d) => sum + (d.result?.issues.length ?? 0), 0,
    );
    notifyReportComplete(finalDevices.length, totalIssues);
  }, [deviceList, url, isMobile]);

  // --- Cancel ---
  const handleCancel = useCallback(() => {
    if (queueRef.current) {
      queueRef.current.cancel();
      setResultDevices([...queueRef.current.devices]);
      setPhase('results');
      resetTitle();
    }
  }, []);

  // --- Jump to device handler ---
  const handleJumpToDevice = useCallback((value: string) => {
    setJumpToDevice(value);
    const index = parseInt(value, 10);
    if (!isNaN(index)) {
      const el = cardRefs.current.get(index);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, []);

  // --- Build ReportData for export toolbar ---
  const reportData = useMemo((): ReportData => ({
    url,
    generatedAt: new Date().toISOString(),
    deviceDatabaseVersion: '1.0',
    screenenticVersion: '0.1.0',
    devices: resultDevices.map(d => ({
      config: d.config,
      screenshot: d.result?.screenshotBlob ?? null,
      screenshotAnnotated: d.result?.screenshotAnnotatedBlob ?? null,
      metrics: d.result?.metrics ?? null,
      issues: d.result?.issues ?? [],
      status: d.status === 'complete' ? 'complete' : d.status === 'skipped' ? 'skipped' : 'failed',
      error: d.error ?? undefined,
    })),
    isAutoAudit: false,
    networkProfile: networkProfile !== 'none' ? THROTTLE_PROFILES[networkProfile]?.name : undefined,
    cpuProfile: CPU_PROFILES[cpuProfile]?.name,
  }), [resultDevices, url, networkProfile, cpuProfile]);

  // --- Metric rows for a device ---
  const metricRows = useMemo(() => [
    { label: 'Load Time', key: 'loadTimeMs' as keyof PerformanceMetrics, unit: 'ms' },
    { label: 'FCP', key: 'fcpMs' as keyof PerformanceMetrics, unit: 'ms' },
    { label: 'LCP', key: 'lcpMs' as keyof PerformanceMetrics, unit: 'ms' },
    { label: 'CLS', key: 'cls' as keyof PerformanceMetrics, unit: 'score' },
    { label: 'Resources', key: 'resourceCount' as keyof PerformanceMetrics, unit: 'count' },
    { label: 'Transfer Size', key: 'transferSizeKB' as keyof PerformanceMetrics, unit: 'KB' },
  ], []);

  // ===== Render =====

  if (!url) {
    return (
      <div className="screen rs-empty">
        <h2>No URL specified</h2>
        <p>Navigate from the URL entry screen to start a report.</p>
      </div>
    );
  }

  // --- Config Phase ---
  if (phase === 'config') {
    return (
      <div className="screen rs">
        <div className="rs-header">
          <h2 className="rs-title">Report Mode</h2>
          <p className="rs-url">{url}</p>
        </div>

        {/* Device Selector */}
        <div className="rs-section">
          <h3 className="rs-section-title">Add Device</h3>
          <DeviceSelector value={selectorState} onChange={setSelectorState} label="Report device selector" />
          <div className="rs-add-row">
            <button
              className="btn btn-primary"
              onClick={handleAddDevice}
              disabled={deviceList.length >= deviceCap}
              aria-label="Add device to report list"
            >
              Add Device
            </button>
            <button
              className="btn"
              onClick={handleAutoAudit}
              aria-label="Populate device list with automatic audit baseline"
            >
              Automatic Audit
            </button>
            <span className="rs-cap-label">
              {deviceList.length} / {deviceCap} devices
            </span>
          </div>
        </div>

        {/* Device List */}
        {deviceList.length > 0 && (
          <div className="rs-section">
            <h3 className="rs-section-title">Device List</h3>
            <ul className="rs-device-list" aria-label="Selected devices for report">
              {deviceList.map((device, i) => (
                <li key={i} className="rs-device-item">
                  <span className="rs-device-name">{deviceDisplayName(device)}</span>
                  <span className="rs-device-config">
                    {device.width}×{device.height} @{device.dpr}x — {device.browser} — {device.orientation}
                  </span>
                  <button
                    className="btn rs-remove-btn"
                    onClick={() => handleRemoveDevice(i)}
                    aria-label={`Remove ${deviceDisplayName(device)}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            {deviceList.length > 1 && (
              <button
                className="btn btn-danger"
                onClick={handleClearAll}
                aria-label="Clear all devices from list"
                style={{ alignSelf: 'flex-start' }}
              >
                Clear All
              </button>
            )}
          </div>
        )}

        {/* Network / CPU Profiles */}
        <div className="rs-section rs-profiles">
          <div className="rs-profile-group">
            <label className="ds-label">
              Network Profile
              <select
                className="input ds-select"
                value={networkProfile}
                onChange={e => setNetworkProfile(e.target.value)}
                aria-label="Network throttle profile"
              >
                <option value="none">None (Full speed)</option>
                {Object.entries(THROTTLE_PROFILES).map(([key, profile]) => (
                  <option key={key} value={key}>{profile.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="rs-profile-group">
            <label className="ds-label">
              CPU Profile
              <select
                className="input ds-select"
                value={cpuProfile}
                onChange={e => setCpuProfile(e.target.value)}
                aria-label="CPU throttle profile"
              >
                {Object.entries(CPU_PROFILES).map(([key, profile]) => (
                  <option key={key} value={key}>{profile.name}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* Generate Button */}
        <div className="rs-actions">
          <button
            className="btn btn-primary rs-generate-btn"
            onClick={handleGenerate}
            disabled={deviceList.length === 0}
            aria-label="Generate report"
          >
            Generate Report
          </button>
        </div>

        {/* Undo Toast */}
        {toast && (
          <UndoToast
            message={toast.message}
            onUndo={() => { toast.onUndo(); dismissToast(); }}
            onDismiss={dismissToast}
          />
        )}

        {/* Clear All Confirmation Dialog */}
        {showClearConfirm && (
          <div className="confirm-dialog-overlay" role="dialog" aria-modal="true" aria-label="Confirm clear all devices">
            <div className="confirm-dialog">
              <h3 className="confirm-dialog-title">Clear All Devices</h3>
              <p className="confirm-dialog-message">
                Remove all {deviceList.length} devices from the list?
              </p>
              <div className="confirm-dialog-actions">
                <button className="btn" onClick={cancelClearAll}>Cancel</button>
                <button className="btn btn-danger" onClick={confirmClearAll}>Clear All</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- Generating Phase ---
  if (phase === 'generating') {
    return (
      <div className="screen rs">
        <div className="rs-header">
          <h2 className="rs-title">Generating Report</h2>
          <p className="rs-url">{url}</p>
        </div>
        <ReportProgress progress={progress} devices={queueDevices} onCancel={handleCancel} />
      </div>
    );
  }

  // --- Results Phase ---
  return (
    <div className="screen rs">
      <div className="rs-header">
        <h2 className="rs-title">Report Results</h2>
        <p className="rs-url">{url}</p>
      </div>

      {/* Export Toolbar */}
      <ReportExportToolbar
        report={reportData}
        devices={resultDevices}
        url={url}
        isMobile={isMobile}
      />

      {/* Compare Selector (desktop only) */}
      {!isMobile && resultDevices.length >= 2 && (
        <CompareSelector
          devices={resultDevices}
          url={url}
          deviceDisplayName={deviceDisplayName}
        />
      )}

      {/* Sticky jump-to-device dropdown (mobile only) */}
      {isMobile && resultDevices.length > 0 && (
        <div className="rs-jump-dropdown" role="navigation" aria-label="Jump to device">
          <label className="ds-label" htmlFor="rs-jump-select">
            Jump to device
          </label>
          <select
            id="rs-jump-select"
            className="input ds-select"
            value={jumpToDevice}
            onChange={e => handleJumpToDevice(e.target.value)}
            aria-label="Jump to device"
          >
            <option value="">Select a device…</option>
            {resultDevices.map((device, i) => (
              <option key={i} value={String(i)}>
                {deviceDisplayName(device.config)}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="rs-results">
        {resultDevices.map((device, i) => (
          <div
            key={i}
            className={`rs-result-card rs-result-card--${device.status}`}
            ref={el => { if (el) cardRefs.current.set(i, el); else cardRefs.current.delete(i); }}
            data-device-index={i}
          >
            <div className="rs-result-header">
              <h3 className="rs-result-device-name">{deviceDisplayName(device.config)}</h3>
              <span className="rs-result-config">
                {device.config.width}×{device.config.height} @{device.config.dpr}x — {device.config.browser} — {device.config.orientation}
              </span>
              {device.status === 'failed' && (
                <span className="rs-result-status rs-result-status--failed">Failed: {device.error}</span>
              )}
              {device.status === 'skipped' && (
                <span className="rs-result-status rs-result-status--skipped">Skipped: {device.error}</span>
              )}
            </div>

            {/* Screenshot */}
            {device.status === 'complete' && device.result && (
              <div className="rs-result-body">
                <div className="rs-screenshot-wrap">
                  {isMobile ? (
                    <LazyScreenshotImage
                      blob={device.result.screenshotAnnotatedBlob}
                      alt={`Screenshot of ${deviceDisplayName(device.config)}`}
                    />
                  ) : (
                    <ScreenshotImage
                      blob={device.result.screenshotAnnotatedBlob}
                      alt={`Screenshot of ${deviceDisplayName(device.config)}`}
                    />
                  )}
                </div>

                {/* Metrics Table */}
                <table className="rs-metrics-table">
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metricRows.map(row => (
                      <tr key={row.key}>
                        <td>{row.label}</td>
                        <td>{formatMetric(device.result!.metrics[row.key] as number | null, row.unit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Issues */}
                {device.result.issues.length > 0 ? (
                  <ul className="rs-issue-list" aria-label={`Issues for ${deviceDisplayName(device.config)}`}>
                    {device.result.issues.map((issue, j) => (
                      <li key={j} className="rs-issue-item">
                        <span className={severityBadgeClass(issue.severity)}>{issue.severity}</span>
                        <span className="rs-issue-type">{issue.type.replace(/_/g, ' ')}</span>
                        <span className="rs-issue-desc">{issue.description}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rs-no-issues">No issues detected</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== ScreenshotImage helper =====

function ScreenshotImage({ blob, alt }: { blob: Blob; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setSrc(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  if (!src) return null;
  return <img className="rs-screenshot" src={src} alt={alt} />;
}

// ===== LazyScreenshotImage (mobile) =====

/**
 * Lazy-loads a screenshot blob using IntersectionObserver.
 * Only creates the object URL when the element scrolls into view.
 * Revokes the URL when scrolled far away to respect the 3-blob memory cap.
 */
function LazyScreenshotImage({ blob, alt }: { blob: Blob; alt: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            // Element is visible — create object URL if not already loaded
            if (!objectUrlRef.current) {
              const url = URL.createObjectURL(blob);
              objectUrlRef.current = url;
              setSrc(url);
            }
          } else {
            // Element is out of view — revoke to free memory
            if (objectUrlRef.current) {
              URL.revokeObjectURL(objectUrlRef.current);
              objectUrlRef.current = null;
              setSrc(null);
            }
          }
        }
      },
      {
        rootMargin: '100% 0px', // Load when within 1 viewport height
      },
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [blob]);

  return (
    <div ref={containerRef} className="rs-lazy-screenshot">
      {src ? (
        <img className="rs-screenshot" src={src} alt={alt} />
      ) : (
        <div className="rs-screenshot-placeholder" aria-label={alt}>
          <span className="rs-placeholder-text">Scroll to load screenshot</span>
        </div>
      )}
    </div>
  );
}
