import { describe, it, expect } from 'vitest';
import { computeComparison, buildMetricDeltas } from './HistoryScreen';

// ===== Unit tests for HistoryScreen comparison logic =====

function makeReport(id: string, url: string, createdAt: string, devices: any[]) {
  return { id, url, createdAt, devices };
}

function makeDevice(
  name: string,
  issueCount: number,
  metrics: { loadTimeMs?: number | null; fcpMs?: number | null; lcpMs?: number | null; cls?: number | null } | null = null,
) {
  return {
    deviceName: name,
    deviceConfig: { deviceId: name.toLowerCase().replace(/\s/g, '-') },
    issues: Array.from({ length: issueCount }, (_, i) => ({ type: `issue_${i}` })),
    metrics: metrics ? {
      loadTimeMs: metrics.loadTimeMs ?? null,
      fcpMs: metrics.fcpMs ?? null,
      lcpMs: metrics.lcpMs ?? null,
      cls: metrics.cls ?? null,
    } : null,
    status: 'complete',
  };
}

describe('computeComparison', () => {
  it('marks device as improved when issue count decreases', () => {
    const a = makeReport('a', 'https://example.com', '2024-01-01', [makeDevice('iPhone 15', 5)]);
    const b = makeReport('b', 'https://example.com', '2024-02-01', [makeDevice('iPhone 15', 2)]);
    const result = computeComparison(a, b);

    expect(result.deviceComparisons).toHaveLength(1);
    expect(result.deviceComparisons[0].verdict).toBe('improved');
    expect(result.deviceComparisons[0].issueDelta).toBe(-3);
    expect(result.summary.improved).toBe(1);
  });

  it('marks device as regressed when issue count increases', () => {
    const a = makeReport('a', 'https://example.com', '2024-01-01', [makeDevice('Pixel 8', 1)]);
    const b = makeReport('b', 'https://example.com', '2024-02-01', [makeDevice('Pixel 8', 4)]);
    const result = computeComparison(a, b);

    expect(result.deviceComparisons[0].verdict).toBe('regressed');
    expect(result.deviceComparisons[0].issueDelta).toBe(3);
    expect(result.summary.regressed).toBe(1);
  });

  it('marks device as unchanged when issue count stays the same', () => {
    const a = makeReport('a', 'https://example.com', '2024-01-01', [makeDevice('Galaxy S24', 3)]);
    const b = makeReport('b', 'https://example.com', '2024-02-01', [makeDevice('Galaxy S24', 3)]);
    const result = computeComparison(a, b);

    expect(result.deviceComparisons[0].verdict).toBe('unchanged');
    expect(result.deviceComparisons[0].issueDelta).toBe(0);
    expect(result.summary.unchanged).toBe(1);
  });

  it('marks device as added when only in report B', () => {
    const a = makeReport('a', 'https://example.com', '2024-01-01', []);
    const b = makeReport('b', 'https://example.com', '2024-02-01', [makeDevice('iPad Pro', 2)]);
    const result = computeComparison(a, b);

    expect(result.deviceComparisons[0].verdict).toBe('added');
    expect(result.summary.addedDevices).toBe(1);
  });

  it('marks device as removed when only in report A', () => {
    const a = makeReport('a', 'https://example.com', '2024-01-01', [makeDevice('iPhone SE', 1)]);
    const b = makeReport('b', 'https://example.com', '2024-02-01', []);
    const result = computeComparison(a, b);

    expect(result.deviceComparisons[0].verdict).toBe('removed');
    expect(result.summary.removedDevices).toBe(1);
  });

  it('handles multiple devices with mixed verdicts', () => {
    const a = makeReport('a', 'https://example.com', '2024-01-01', [
      makeDevice('iPhone 15', 5),
      makeDevice('Pixel 8', 1),
      makeDevice('Galaxy S24', 3),
    ]);
    const b = makeReport('b', 'https://example.com', '2024-02-01', [
      makeDevice('iPhone 15', 2),
      makeDevice('Pixel 8', 4),
      makeDevice('Galaxy S24', 3),
    ]);
    const result = computeComparison(a, b);

    expect(result.summary.improved).toBe(1);
    expect(result.summary.regressed).toBe(1);
    expect(result.summary.unchanged).toBe(1);
    expect(result.deviceComparisons).toHaveLength(3);
  });

  it('sets report metadata correctly', () => {
    const a = makeReport('report-a', 'https://test.com', '2024-01-15T10:00:00Z', []);
    const b = makeReport('report-b', 'https://test.com', '2024-02-20T14:00:00Z', []);
    const result = computeComparison(a, b);

    expect(result.reportA.id).toBe('report-a');
    expect(result.reportB.id).toBe('report-b');
    expect(result.url).toBe('https://test.com');
  });
});

describe('buildMetricDeltas', () => {
  it('returns unavailable when metrics are null', () => {
    const deltas = buildMetricDeltas(null, null);
    expect(deltas).toHaveLength(4);
    deltas.forEach(d => {
      expect(d.direction).toBe('unavailable');
      expect(d.delta).toBeNull();
    });
  });

  it('returns improved when load time decreases', () => {
    const a = { loadTimeMs: 3000, fcpMs: null, lcpMs: null, cls: null };
    const b = { loadTimeMs: 2000, fcpMs: null, lcpMs: null, cls: null };
    const deltas = buildMetricDeltas(a, b);
    const loadDelta = deltas.find(d => d.metric === 'Load Time (ms)');
    expect(loadDelta?.direction).toBe('improved');
    expect(loadDelta?.delta).toBe(-1000);
  });

  it('returns regressed when CLS increases', () => {
    const a = { loadTimeMs: null, fcpMs: null, lcpMs: null, cls: 0.05 };
    const b = { loadTimeMs: null, fcpMs: null, lcpMs: null, cls: 0.15 };
    const deltas = buildMetricDeltas(a, b);
    const clsDelta = deltas.find(d => d.metric === 'CLS');
    expect(clsDelta?.direction).toBe('regressed');
    expect(clsDelta?.delta).toBeCloseTo(0.1);
  });

  it('returns unchanged when values are equal', () => {
    const metrics = { loadTimeMs: 1500, fcpMs: 800, lcpMs: 2000, cls: 0.05 };
    const deltas = buildMetricDeltas(metrics, metrics);
    deltas.forEach(d => {
      expect(d.direction).toBe('unchanged');
      expect(d.delta).toBe(0);
    });
  });
});
