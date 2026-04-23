import type { ReportData, DeviceReportEntry } from '@shared/types';

/**
 * Escapes a string value for safe inclusion in a CSV field.
 * Wraps in double quotes if the value contains commas, double quotes, or newlines.
 * Internal double quotes are escaped by doubling them.
 */
export function escapeCSV(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Builds a device display name from a DeviceReportEntry config.
 */
function deviceName(entry: DeviceReportEntry): string {
  return entry.config.deviceId ?? `${entry.config.width}x${entry.config.height}`;
}

/**
 * Serializes the full ReportData to JSON, replacing Blob fields with null
 * since Blobs are not JSON-serializable.
 * Returns a Blob with MIME type application/json.
 */
export function exportJSON(report: ReportData): Blob {
  const sanitized = {
    ...report,
    devices: report.devices.map((d) => ({
      ...d,
      screenshot: null,
      screenshotAnnotated: null,
    })),
  };
  const json = JSON.stringify(sanitized, null, 2);
  return new Blob([json], { type: 'application/json' });
}

const CSV_COLUMNS = [
  'Device',
  'Width',
  'Height',
  'DPR',
  'Browser',
  'Orientation',
  'Status',
  'Load Time (ms)',
  'FCP (ms)',
  'LCP (ms)',
  'CLS',
  'Resources',
  'Transfer Size (KB)',
  'Issues',
  'Observations',
] as const;

/**
 * Builds a single CSV row array from a DeviceReportEntry.
 * Null metrics are represented as empty strings.
 * Issues and Observations are counts.
 */
export function buildCSVRow(entry: DeviceReportEntry): string[] {
  const m = entry.metrics;
  const issueCount = entry.issues.filter((i) => i.severity === 'issue').length;
  const observationCount = entry.issues.filter((i) => i.severity === 'observation').length;

  const fmt = (v: number | null | undefined): string => (v == null ? '' : String(v));

  return [
    deviceName(entry),
    String(entry.config.width),
    String(entry.config.height),
    String(entry.config.dpr),
    entry.config.browser,
    entry.config.orientation,
    entry.status,
    fmt(m?.loadTimeMs),
    fmt(m?.fcpMs),
    fmt(m?.lcpMs),
    fmt(m?.cls),
    fmt(m?.resourceCount),
    fmt(m?.transferSizeKB),
    String(issueCount),
    String(observationCount),
  ];
}

/**
 * Generates a CSV summary table with one row per device.
 * Returns a Blob with MIME type text/csv.
 */
export function exportCSV(report: ReportData): Blob {
  const header = CSV_COLUMNS.map((c) => escapeCSV(c)).join(',');
  const rows = report.devices.map((d) =>
    buildCSVRow(d).map((v) => escapeCSV(v)).join(',')
  );
  const csv = [header, ...rows].join('\n');
  return new Blob([csv], { type: 'text/csv' });
}
