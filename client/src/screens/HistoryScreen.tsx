import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { ReportComparison, DeviceComparison, MetricDelta } from '@shared/types';

// ===== Types for report list items from the API =====

interface ReportListItem {
  id: string;
  url: string;
  deviceCount: number;
  issueCount: number;
  createdAt: string;
  visibility: string;
}

interface ReportDetail {
  id: string;
  url: string;
  createdAt: string;
  devices: {
    deviceName: string;
    deviceConfig: { deviceId: string | null };
    issues: { type: string }[];
    metrics: {
      loadTimeMs: number | null;
      fcpMs: number | null;
      lcpMs: number | null;
      cls: number | null;
    } | null;
    status: string;
  }[];
}

// ===== Comparison logic (pure, testable) =====

export function computeComparison(
  reportA: ReportDetail,
  reportB: ReportDetail,
): ReportComparison {
  const deviceMapA = new Map(
    reportA.devices.map(d => [d.deviceName, d]),
  );
  const deviceMapB = new Map(
    reportB.devices.map(d => [d.deviceName, d]),
  );

  const allDeviceNames = new Set([...deviceMapA.keys(), ...deviceMapB.keys()]);
  const deviceComparisons: DeviceComparison[] = [];

  for (const name of allDeviceNames) {
    const devA = deviceMapA.get(name);
    const devB = deviceMapB.get(name);

    if (!devA) {
      deviceComparisons.push({
        deviceId: devB!.deviceConfig.deviceId ?? name,
        deviceName: name,
        verdict: 'added',
        issueCountA: 0,
        issueCountB: devB!.issues.length,
        issueDelta: devB!.issues.length,
        metricDeltas: [],
      });
      continue;
    }

    if (!devB) {
      deviceComparisons.push({
        deviceId: devA.deviceConfig.deviceId ?? name,
        deviceName: name,
        verdict: 'removed',
        issueCountA: devA.issues.length,
        issueCountB: 0,
        issueDelta: -devA.issues.length,
        metricDeltas: [],
      });
      continue;
    }

    const issueCountA = devA.issues.length;
    const issueCountB = devB.issues.length;
    const issueDelta = issueCountB - issueCountA;

    const metricDeltas: MetricDelta[] = buildMetricDeltas(devA.metrics, devB.metrics);

    let verdict: DeviceComparison['verdict'] = 'unchanged';
    if (issueDelta < 0) verdict = 'improved';
    else if (issueDelta > 0) verdict = 'regressed';

    deviceComparisons.push({
      deviceId: devA.deviceConfig.deviceId ?? name,
      deviceName: name,
      verdict,
      issueCountA,
      issueCountB,
      issueDelta,
      metricDeltas,
    });
  }

  const summary = {
    improved: deviceComparisons.filter(d => d.verdict === 'improved').length,
    regressed: deviceComparisons.filter(d => d.verdict === 'regressed').length,
    unchanged: deviceComparisons.filter(d => d.verdict === 'unchanged').length,
    addedDevices: deviceComparisons.filter(d => d.verdict === 'added').length,
    removedDevices: deviceComparisons.filter(d => d.verdict === 'removed').length,
  };

  return {
    reportA: { id: reportA.id, createdAt: reportA.createdAt },
    reportB: { id: reportB.id, createdAt: reportB.createdAt },
    url: reportA.url,
    deviceComparisons,
    summary,
  };
}

export function buildMetricDeltas(
  metricsA: ReportDetail['devices'][0]['metrics'],
  metricsB: ReportDetail['devices'][0]['metrics'],
): MetricDelta[] {
  const keys: { key: keyof NonNullable<typeof metricsA>; label: string; lowerIsBetter: boolean }[] = [
    { key: 'loadTimeMs', label: 'Load Time (ms)', lowerIsBetter: true },
    { key: 'fcpMs', label: 'FCP (ms)', lowerIsBetter: true },
    { key: 'lcpMs', label: 'LCP (ms)', lowerIsBetter: true },
    { key: 'cls', label: 'CLS', lowerIsBetter: true },
  ];

  return keys.map(({ key, label, lowerIsBetter }) => {
    const valA = metricsA?.[key] ?? null;
    const valB = metricsB?.[key] ?? null;

    if (valA === null || valB === null) {
      return { metric: label, valueA: valA, valueB: valB, delta: null, direction: 'unavailable' as const };
    }

    const delta = valB - valA;
    let direction: MetricDelta['direction'] = 'unchanged';
    if (Math.abs(delta) > 0.001) {
      direction = (lowerIsBetter ? delta < 0 : delta > 0) ? 'improved' : 'regressed';
    }

    return { metric: label, valueA: valA, valueB: valB, delta, direction };
  });
}

// ===== Helpers =====

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function verdictColor(verdict: DeviceComparison['verdict']): string {
  switch (verdict) {
    case 'improved': return 'var(--success)';
    case 'regressed': return 'var(--error)';
    case 'added': return 'var(--primary)';
    case 'removed': return 'var(--warning)';
    default: return 'var(--text-muted)';
  }
}

function verdictLabel(verdict: DeviceComparison['verdict']): string {
  switch (verdict) {
    case 'improved': return '✓ Improved';
    case 'regressed': return '✗ Regressed';
    case 'added': return '+ Added';
    case 'removed': return '− Removed';
    default: return '— Unchanged';
  }
}

// ===== Component =====

export function HistoryScreen() {
  const { isAuthenticated, accessToken } = useAuth();

  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [comparison, setComparison] = useState<ReportComparison | null>(null);
  const [comparing, setComparing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Fetch reports on mount
  const fetchReports = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/reports', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Failed to load reports.');
      const data = await res.json();
      setReports(data.reports ?? []);
    } catch {
      setError('Could not load your reports. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  // Selection logic
  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setComparison(null);
  };

  const selectedReports = reports.filter(r => selected.has(r.id));
  const canCompare =
    selectedReports.length === 2 &&
    selectedReports[0].url === selectedReports[1].url;

  const selectionHint = (() => {
    if (selectedReports.length === 0) return 'Select two reports for the same URL to compare.';
    if (selectedReports.length === 1) return 'Select one more report for the same URL.';
    if (selectedReports.length === 2 && !canCompare) return 'Selected reports must be for the same URL.';
    if (canCompare) return 'Ready to compare!';
    return 'Select exactly two reports.';
  })();

  // Compare
  const handleCompare = async () => {
    if (!canCompare || !accessToken) return;
    const [a, b] = selectedReports;
    setComparing(true);
    setError(null);
    try {
      const [resA, resB] = await Promise.all([
        fetch(`/api/reports/${a.id}`, { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch(`/api/reports/${b.id}`, { headers: { Authorization: `Bearer ${accessToken}` } }),
      ]);
      if (!resA.ok || !resB.ok) throw new Error('Failed to load report details.');
      const detailA: ReportDetail = (await resA.json()).report ?? await resA.json();
      const detailB: ReportDetail = (await resB.json()).report ?? await resB.json();
      setComparison(computeComparison(detailA, detailB));
    } catch {
      setError('Could not load report details for comparison.');
    } finally {
      setComparing(false);
    }
  };

  // Delete
  const handleDelete = async (id: string) => {
    if (!accessToken) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/reports/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Delete failed.');
      setReports(prev => prev.filter(r => r.id !== id));
      setSelected(prev => { const next = new Set(prev); next.delete(id); return next; });
      if (comparison && (comparison.reportA.id === id || comparison.reportB.id === id)) {
        setComparison(null);
      }
    } catch {
      setError('Could not delete report. Please try again.');
    } finally {
      setDeleting(null);
    }
  };

  // ---- Not authenticated ----
  if (!isAuthenticated) {
    return (
      <div className="history-screen">
        <div className="history-empty">
          <h2>Report History</h2>
          <p>Log in to view your saved reports and compare them over time.</p>
          <Link to="/login?returnTo=/history" className="btn btn-primary">Log in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="history-screen">
      <div className="history-header">
        <h2 className="history-title">Report History</h2>
        <p className="history-subtitle">{selectionHint}</p>
      </div>

      {error && <p className="auth-error" role="alert">{error}</p>}

      {loading && <p className="auth-loading">Loading reports…</p>}

      {!loading && reports.length === 0 && !error && (
        <div className="history-empty">
          <p>No reports yet. Generate a report to see it here.</p>
          <Link to="/" className="btn btn-primary">Test a URL</Link>
        </div>
      )}

      {/* Report list */}
      {reports.length > 0 && (
        <div className="history-section">
          <ul className="history-list" role="list">
            {reports.map(report => (
              <li key={report.id} className="history-item">
                <label className={`history-item-label${selected.has(report.id) ? ' history-item-label--checked' : ''}`}>
                  <input
                    type="checkbox"
                    className="history-checkbox"
                    checked={selected.has(report.id)}
                    onChange={() => toggleSelect(report.id)}
                    aria-label={`Select report for ${report.url}`}
                  />
                  <div className="history-item-info">
                    <span className="history-item-url">{report.url}</span>
                    <span className="history-item-meta">
                      {formatDate(report.createdAt)} · {report.deviceCount} device{report.deviceCount !== 1 ? 's' : ''} · {report.issueCount} issue{report.issueCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="history-item-actions">
                    <Link
                      to={`/report/${report.id}`}
                      className="btn history-view-btn"
                      onClick={e => e.stopPropagation()}
                    >
                      View
                    </Link>
                    <button
                      className="btn btn-danger history-delete-btn"
                      onClick={e => { e.preventDefault(); handleDelete(report.id); }}
                      disabled={deleting === report.id}
                      aria-label={`Delete report for ${report.url}`}
                    >
                      {deleting === report.id ? '…' : '✕'}
                    </button>
                  </div>
                </label>
              </li>
            ))}
          </ul>

          {selectedReports.length === 2 && (
            <button
              className="btn btn-primary history-compare-btn"
              onClick={handleCompare}
              disabled={!canCompare || comparing}
            >
              {comparing ? 'Comparing…' : canCompare ? 'Compare Selected Reports' : 'Select same-URL reports'}
            </button>
          )}
        </div>
      )}

      {/* Comparison view */}
      {comparison && (
        <div className="history-comparison">
          <div className="history-comparison-header">
            <h3>Comparison: {comparison.url}</h3>
            <p className="history-comparison-dates">
              Report A: {formatDate(comparison.reportA.createdAt)} vs Report B: {formatDate(comparison.reportB.createdAt)}
            </p>
            <button className="btn history-close-comparison" onClick={() => setComparison(null)}>Close</button>
          </div>

          <div className="history-comparison-summary">
            <span className="history-summary-chip history-summary-improved">
              {comparison.summary.improved} improved
            </span>
            <span className="history-summary-chip history-summary-regressed">
              {comparison.summary.regressed} regressed
            </span>
            <span className="history-summary-chip history-summary-unchanged">
              {comparison.summary.unchanged} unchanged
            </span>
            {comparison.summary.addedDevices > 0 && (
              <span className="history-summary-chip history-summary-added">
                {comparison.summary.addedDevices} added
              </span>
            )}
            {comparison.summary.removedDevices > 0 && (
              <span className="history-summary-chip history-summary-removed">
                {comparison.summary.removedDevices} removed
              </span>
            )}
          </div>

          <ul className="history-device-comparisons" role="list">
            {comparison.deviceComparisons.map(dc => (
              <li key={dc.deviceId} className="history-dc-item">
                <div className="history-dc-header">
                  <span className="history-dc-name">{dc.deviceName}</span>
                  <span
                    className="history-dc-verdict"
                    style={{ color: verdictColor(dc.verdict) }}
                  >
                    {verdictLabel(dc.verdict)}
                  </span>
                </div>
                {dc.verdict !== 'added' && dc.verdict !== 'removed' && (
                  <div className="history-dc-details">
                    <span className="history-dc-issues">
                      Issues: {dc.issueCountA} → {dc.issueCountB}
                      {dc.issueDelta !== 0 && (
                        <span style={{ color: dc.issueDelta < 0 ? 'var(--success)' : 'var(--error)', marginLeft: 6 }}>
                          ({dc.issueDelta > 0 ? '+' : ''}{dc.issueDelta})
                        </span>
                      )}
                    </span>
                    {dc.metricDeltas.length > 0 && (
                      <div className="history-dc-metrics">
                        {dc.metricDeltas.map(md => (
                          <span
                            key={md.metric}
                            className="history-dc-metric"
                            style={{ color: md.direction === 'improved' ? 'var(--success)' : md.direction === 'regressed' ? 'var(--error)' : 'var(--text-muted)' }}
                          >
                            {md.metric}: {md.delta !== null ? `${md.delta > 0 ? '+' : ''}${md.delta.toFixed(1)}` : 'N/A'}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
