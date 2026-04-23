import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ReportExportToolbar } from '../components/ReportExportToolbar';
import { ReportVisibilityControls } from '../components/ReportVisibilityControls';
import { useAuth } from '../contexts/AuthContext';
import { useDevices } from '../contexts/DeviceContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import type {
  DeviceEntry,
  DeviceSelectorState,
  PerformanceMetrics,
  DetectedIssue,
  ReportData,
  DeviceReportEntry,
  QueuedDevice,
} from '@shared/types';

// ===== Types for API response =====

interface ReportDeviceResponse {
  device_name: string;
  device_config: DeviceSelectorState;
  screenshot_url: string | null;
  screenshot_annotated_url: string | null;
  metrics: PerformanceMetrics | null;
  issues: DetectedIssue[];
  status: 'complete' | 'failed' | 'skipped';
  error_message?: string;
}

interface ReportResponse {
  id: string;
  user_id: string | null;
  url: string;
  created_at: string;
  device_count: number;
  issue_count: number;
  visibility: 'private' | 'unlisted';
  share_token: string | null;
  share_expires_at: string | null;
  device_db_version: string | null;
  is_auto_audit: boolean;
  metadata: Record<string, unknown> | null;
  devices: ReportDeviceResponse[];
}

// ===== Helpers =====

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

const METRIC_ROWS: { label: string; key: keyof PerformanceMetrics; unit: string }[] = [
  { label: 'Load Time', key: 'loadTimeMs', unit: 'ms' },
  { label: 'FCP', key: 'fcpMs', unit: 'ms' },
  { label: 'LCP', key: 'lcpMs', unit: 'ms' },
  { label: 'CLS', key: 'cls', unit: 'score' },
  { label: 'Resources', key: 'resourceCount', unit: 'count' },
  { label: 'Transfer Size', key: 'transferSizeKB', unit: 'KB' },
];

type ErrorState = {
  code: 404 | 403 | 410 | 0;
  message: string;
};

// ===== Component =====

export function ReportDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { accessToken, user } = useAuth();
  const { devices: allDevices } = useDevices();
  const isMobile = useMediaQuery('(max-width: 768px)');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorState | null>(null);
  const [report, setReport] = useState<ReportResponse | null>(null);

  // Determine if the current user owns this report
  const isOwner = !!(user && report && report.user_id === user.id);

  // Visibility control callbacks
  const handleVisibilityChange = useCallback((visibility: 'private' | 'unlisted') => {
    setReport(prev => prev ? { ...prev, visibility } : prev);
  }, []);

  const handleShareCreated = useCallback((_shareUrl: string, shareToken: string) => {
    setReport(prev => prev ? { ...prev, share_token: shareToken } : prev);
  }, []);

  const handleShareRevoked = useCallback(() => {
    setReport(prev => prev ? { ...prev, share_token: null, share_expires_at: null } : prev);
  }, []);

  // Fetch report on mount
  useEffect(() => {
    if (!id) return;

    const controller = new AbortController();

    async function fetchReport() {
      setLoading(true);
      setError(null);

      try {
        const url = new URL(`/api/reports/${id}`, window.location.origin);
        if (token) url.searchParams.set('token', token);

        const headers: Record<string, string> = {};
        if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

        const res = await fetch(url.toString(), {
          headers,
          signal: controller.signal,
        });

        if (!res.ok) {
          if (res.status === 404) {
            setError({ code: 404, message: 'Report not found or has been deleted' });
          } else if (res.status === 403) {
            setError({ code: 403, message: 'This report is private' });
          } else if (res.status === 410) {
            setError({ code: 410, message: 'This report has expired' });
          } else {
            setError({ code: 0, message: 'Could not load report' });
          }
          setLoading(false);
          return;
        }

        const data: ReportResponse = await res.json();
        setReport(data);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError({ code: 0, message: 'Could not load report' });
      } finally {
        setLoading(false);
      }
    }

    fetchReport();
    return () => controller.abort();
  }, [id, token, accessToken]);

  // Build ReportData for the export toolbar
  const reportData: ReportData | null = useMemo(() => {
    if (!report) return null;
    return {
      url: report.url,
      generatedAt: report.created_at,
      deviceDatabaseVersion: report.device_db_version || 'unknown',
      screenenticVersion: 'v0.1.0',
      devices: report.devices.map((d): DeviceReportEntry => ({
        config: d.device_config,
        screenshot: null, // blobs not available from API — PDF re-generation uses URLs
        screenshotAnnotated: null,
        metrics: d.metrics,
        issues: d.issues,
        status: d.status,
        error: d.error_message,
      })),
      isAutoAudit: report.is_auto_audit,
    };
  }, [report]);

  // Build QueuedDevice[] for the export toolbar
  const queuedDevices: QueuedDevice[] = useMemo(() => {
    if (!report) return [];
    return report.devices.map((d): QueuedDevice => ({
      config: d.device_config,
      status: d.status === 'complete' ? 'complete' : d.status === 'skipped' ? 'skipped' : 'failed',
      result: null, // blobs not available from stored report
      error: d.error_message || null,
      retryCount: 0,
    }));
  }, [report]);

  // Device display name helper
  function deviceDisplayName(config: DeviceSelectorState): string {
    const entry = allDevices.find((d: DeviceEntry) => d.id === config.deviceId);
    if (entry) return `${entry.manufacturer} ${entry.model}`;
    return `Custom (${config.width}×${config.height})`;
  }

  // --- Loading ---
  if (loading) {
    return (
      <div className="screen rs" role="status" aria-live="polite">
        <div className="rd-loading">
          <p className="rd-loading-text">Loading report…</p>
        </div>
      </div>
    );
  }

  // --- Error ---
  if (error) {
    return (
      <div className="screen rs" role="alert">
        <div className="rd-error">
          <span className="rd-error-icon" aria-hidden="true">
            {error.code === 403 ? '🔒' : error.code === 410 ? '⏰' : error.code === 404 ? '🔍' : '⚠️'}
          </span>
          <h2 className="rd-error-title">{error.message}</h2>
          <p className="rd-error-hint">
            {error.code === 404 && 'The report may have been deleted or the link is incorrect.'}
            {error.code === 403 && 'You may need to log in or request access from the report owner.'}
            {error.code === 410 && 'Shared links expire after their configured duration. Ask the owner for a new link.'}
            {error.code === 0 && 'Check your internet connection and try again.'}
          </p>
        </div>
      </div>
    );
  }

  if (!report || !reportData) return null;

  // --- Report Detail ---
  return (
    <div className="screen rs">
      <div className="rs-header">
        <h2 className="rs-title">Report</h2>
        <p className="rs-url">{report.url}</p>
        <p className="rd-date">
          Generated {new Date(report.created_at).toLocaleDateString(undefined, {
            year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
          })}
        </p>
      </div>

      {/* Export Toolbar */}
      <ReportExportToolbar
        report={reportData}
        devices={queuedDevices}
        url={report.url}
        isMobile={isMobile}
        reportId={report.id}
      />

      {/* Visibility Controls — owner only */}
      {isOwner && (
        <ReportVisibilityControls
          reportId={report.id}
          currentVisibility={report.visibility}
          shareToken={report.share_token}
          shareExpiresAt={report.share_expires_at}
          onVisibilityChange={handleVisibilityChange}
          onShareCreated={handleShareCreated}
          onShareRevoked={handleShareRevoked}
        />
      )}

      {/* Results */}
      <div className="rs-results">
        {report.devices.map((device, i) => (
          <div
            key={i}
            className={`rs-result-card rs-result-card--${device.status}`}
          >
            <div className="rs-result-header">
              <h3 className="rs-result-device-name">{device.device_name || deviceDisplayName(device.device_config)}</h3>
              <span className="rs-result-config">
                {device.device_config.width}×{device.device_config.height} @{device.device_config.dpr}x — {device.device_config.browser} — {device.device_config.orientation}
              </span>
              {device.status === 'failed' && (
                <span className="rs-result-status rs-result-status--failed">Failed: {device.error_message}</span>
              )}
              {device.status === 'skipped' && (
                <span className="rs-result-status rs-result-status--skipped">Skipped: {device.error_message}</span>
              )}
            </div>

            {device.status === 'complete' && (
              <div className="rs-result-body">
                {/* Screenshot */}
                {device.screenshot_annotated_url && (
                  <div className="rs-screenshot-wrap">
                    <img
                      className="rs-screenshot"
                      src={device.screenshot_annotated_url}
                      alt={`Screenshot of ${device.device_name || deviceDisplayName(device.device_config)}`}
                      loading="lazy"
                    />
                  </div>
                )}

                {/* Metrics Table */}
                {device.metrics && (
                  <table className="rs-metrics-table">
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {METRIC_ROWS.map(row => (
                        <tr key={row.key}>
                          <td>{row.label}</td>
                          <td>{formatMetric(device.metrics![row.key] as number | null, row.unit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* Issues */}
                {device.issues.length > 0 ? (
                  <ul className="rs-issue-list" aria-label={`Issues for ${device.device_name || deviceDisplayName(device.device_config)}`}>
                    {device.issues.map((issue, j) => (
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
