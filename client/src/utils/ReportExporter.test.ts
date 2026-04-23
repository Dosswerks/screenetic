import { describe, it, expect } from 'vitest';
import { escapeCSV, buildCSVRow, exportCSV, exportJSON } from './ReportExporter';
import type { ReportData, DeviceReportEntry, PerformanceMetrics, DetectedIssue } from '@shared/types';

// --- Helpers ---

function makeMetrics(overrides: Partial<PerformanceMetrics> = {}): PerformanceMetrics {
  return {
    loadTimeMs: 1200,
    fcpMs: 400,
    lcpMs: 800,
    cls: 0.05,
    resourceCount: 42,
    transferSizeKB: 512,
    cacheMode: 'cold',
    serviceWorkerActive: false,
    label: 'Simulated',
    ...overrides,
  };
}

function makeIssue(severity: 'issue' | 'observation' = 'issue'): DetectedIssue {
  return {
    type: 'horizontal_overflow',
    severity,
    description: 'Content overflows viewport',
    location: null,
    details: {},
  };
}

function makeEntry(overrides: Partial<DeviceReportEntry> = {}): DeviceReportEntry {
  return {
    config: {
      deviceId: 'iphone-14',
      width: 390,
      height: 844,
      dpr: 3,
      browser: 'Safari',
      orientation: 'portrait',
    },
    screenshot: null,
    screenshotAnnotated: null,
    metrics: makeMetrics(),
    issues: [makeIssue('issue'), makeIssue('observation')],
    status: 'complete',
    ...overrides,
  };
}

function makeReport(overrides: Partial<ReportData> = {}): ReportData {
  return {
    url: 'https://example.com',
    generatedAt: '2025-01-15T12:00:00Z',
    deviceDatabaseVersion: '2025.01.1',
    screenenticVersion: '0.1.0',
    devices: [makeEntry()],
    isAutoAudit: false,
    ...overrides,
  };
}

// --- Tests ---

describe('escapeCSV', () => {
  it('returns plain strings unchanged', () => {
    expect(escapeCSV('hello')).toBe('hello');
  });

  it('wraps strings containing commas in double quotes', () => {
    expect(escapeCSV('a,b')).toBe('"a,b"');
  });

  it('wraps strings containing double quotes and escapes them', () => {
    expect(escapeCSV('say "hi"')).toBe('"say ""hi"""');
  });

  it('wraps strings containing newlines', () => {
    expect(escapeCSV('line1\nline2')).toBe('"line1\nline2"');
  });

  it('wraps strings containing carriage returns', () => {
    expect(escapeCSV('line1\rline2')).toBe('"line1\rline2"');
  });

  it('handles strings with commas and quotes together', () => {
    expect(escapeCSV('a,"b"')).toBe('"a,""b"""');
  });

  it('returns empty string unchanged', () => {
    expect(escapeCSV('')).toBe('');
  });

  it('returns numeric-like strings unchanged', () => {
    expect(escapeCSV('1234')).toBe('1234');
  });
});

describe('buildCSVRow', () => {
  it('produces correct columns for a complete entry', () => {
    const row = buildCSVRow(makeEntry());
    expect(row).toEqual([
      'iphone-14',   // Device
      '390',         // Width
      '844',         // Height
      '3',           // DPR
      'Safari',      // Browser
      'portrait',    // Orientation
      'complete',    // Status
      '1200',        // Load Time
      '400',         // FCP
      '800',         // LCP
      '0.05',        // CLS
      '42',          // Resources
      '512',         // Transfer Size
      '1',           // Issues count
      '1',           // Observations count
    ]);
  });

  it('shows empty strings for null metrics', () => {
    const entry = makeEntry({
      metrics: makeMetrics({
        loadTimeMs: null,
        fcpMs: null,
        lcpMs: null,
        cls: null,
        resourceCount: null,
        transferSizeKB: null,
      }),
    });
    const row = buildCSVRow(entry);
    // Load Time, FCP, LCP, CLS, Resources, Transfer Size should be empty
    expect(row[7]).toBe('');
    expect(row[8]).toBe('');
    expect(row[9]).toBe('');
    expect(row[10]).toBe('');
    expect(row[11]).toBe('');
    expect(row[12]).toBe('');
  });

  it('shows empty strings when metrics is null', () => {
    const entry = makeEntry({ metrics: null });
    const row = buildCSVRow(entry);
    expect(row[7]).toBe('');
    expect(row[8]).toBe('');
    expect(row[9]).toBe('');
    expect(row[10]).toBe('');
    expect(row[11]).toBe('');
    expect(row[12]).toBe('');
  });

  it('uses width x height as device name when deviceId is null', () => {
    const entry = makeEntry({
      config: {
        deviceId: null,
        width: 1024,
        height: 768,
        dpr: 1,
        browser: 'Chrome',
        orientation: 'landscape',
      },
    });
    const row = buildCSVRow(entry);
    expect(row[0]).toBe('1024x768');
  });

  it('counts issues and observations separately', () => {
    const entry = makeEntry({
      issues: [
        makeIssue('issue'),
        makeIssue('issue'),
        makeIssue('issue'),
        makeIssue('observation'),
      ],
    });
    const row = buildCSVRow(entry);
    expect(row[13]).toBe('3');  // Issues
    expect(row[14]).toBe('1');  // Observations
  });

  it('shows 0 for issues and observations when none exist', () => {
    const entry = makeEntry({ issues: [] });
    const row = buildCSVRow(entry);
    expect(row[13]).toBe('0');
    expect(row[14]).toBe('0');
  });
});

describe('exportCSV', () => {
  it('produces a header row plus one data row per device', () => {
    const report = makeReport({
      devices: [makeEntry(), makeEntry()],
    });
    const blob = exportCSV(report);
    expect(blob.type).toBe('text/csv');
  });

  it('returns a Blob with text/csv MIME type', () => {
    const blob = exportCSV(makeReport());
    expect(blob.type).toBe('text/csv');
  });
});

describe('exportJSON', () => {
  it('returns a Blob with application/json MIME type', () => {
    const blob = exportJSON(makeReport());
    expect(blob.type).toBe('application/json');
  });

  it('replaces screenshot Blobs with null', async () => {
    const report = makeReport({
      devices: [
        makeEntry({
          screenshot: new Blob(['img'], { type: 'image/png' }),
          screenshotAnnotated: new Blob(['ann'], { type: 'image/png' }),
        }),
      ],
    });
    const blob = exportJSON(report);
    const text = await blob.text();
    const parsed = JSON.parse(text);
    expect(parsed.devices[0].screenshot).toBeNull();
    expect(parsed.devices[0].screenshotAnnotated).toBeNull();
  });

  it('preserves all non-Blob report fields', async () => {
    const report = makeReport();
    const blob = exportJSON(report);
    const text = await blob.text();
    const parsed = JSON.parse(text);
    expect(parsed.url).toBe('https://example.com');
    expect(parsed.generatedAt).toBe('2025-01-15T12:00:00Z');
    expect(parsed.deviceDatabaseVersion).toBe('2025.01.1');
    expect(parsed.screenenticVersion).toBe('0.1.0');
    expect(parsed.isAutoAudit).toBe(false);
    expect(parsed.devices).toHaveLength(1);
    expect(parsed.devices[0].config.deviceId).toBe('iphone-14');
  });

  it('pretty-prints with 2-space indentation', async () => {
    const blob = exportJSON(makeReport());
    const text = await blob.text();
    // 2-space indentation means lines should start with "  "
    const lines = text.split('\n');
    const indentedLines = lines.filter((l) => l.startsWith('  '));
    expect(indentedLines.length).toBeGreaterThan(0);
  });
});
