import { describe, it, expect } from 'vitest';
import type { QueuedDevice, DeviceSelectorState, PerformanceMetrics, DetectedIssue } from '@shared/types';
import {
  isExpired,
  buildProgressKey,
  buildScreenshotKey,
  canRetryDevice,
  serializeForStorage,
  PROGRESS_MAX_AGE_MS,
  MAX_RETRY_COUNT,
} from './ReportPersistence';

// ===== Test helpers =====

const makeConfig = (id: string = 'iphone-15'): DeviceSelectorState => ({
  deviceId: id,
  width: 393,
  height: 852,
  dpr: 3,
  browser: 'Safari',
  orientation: 'portrait',
});

const makeDevice = (
  status: QueuedDevice['status'],
  retryCount: number = 0,
  hasResult: boolean = false,
): QueuedDevice => ({
  config: makeConfig(),
  status,
  result: hasResult
    ? {
        screenshotBlob: new Blob(['img']),
        screenshotAnnotatedBlob: new Blob(['annotated']),
        metrics: {
          loadTimeMs: 1200,
          fcpMs: 800,
          lcpMs: 1500,
          cls: 0.05,
          resourceCount: 42,
          transferSizeKB: 512,
          cacheMode: 'cold',
          serviceWorkerActive: false,
          label: 'Simulated',
        } as PerformanceMetrics,
        issues: [] as DetectedIssue[],
        renderTimeMs: 3000,
      }
    : null,
  error: status === 'failed' ? 'Timeout' : null,
  retryCount,
});

// ===== isExpired =====

describe('isExpired', () => {
  it('returns false for a timestamp within 24 hours', () => {
    const recent = new Date(Date.now() - 1000).toISOString();
    expect(isExpired(recent)).toBe(false);
  });

  it('returns false for a timestamp exactly at the boundary (just under 24h)', () => {
    const almostExpired = new Date(Date.now() - PROGRESS_MAX_AGE_MS + 1000).toISOString();
    expect(isExpired(almostExpired)).toBe(false);
  });

  it('returns true for a timestamp older than 24 hours', () => {
    const old = new Date(Date.now() - PROGRESS_MAX_AGE_MS - 1000).toISOString();
    expect(isExpired(old)).toBe(true);
  });

  it('returns true for an invalid date string', () => {
    expect(isExpired('not-a-date')).toBe(true);
  });

  it('accepts a custom "now" parameter', () => {
    const timestamp = '2024-01-15T12:00:00.000Z';
    const nowWithin24h = new Date('2024-01-15T18:00:00.000Z').getTime();
    const nowBeyond24h = new Date('2024-01-17T12:00:00.000Z').getTime();

    expect(isExpired(timestamp, nowWithin24h)).toBe(false);
    expect(isExpired(timestamp, nowBeyond24h)).toBe(true);
  });
});

// ===== buildProgressKey =====

describe('buildProgressKey', () => {
  it('prefixes sessionId with the expected key format', () => {
    expect(buildProgressKey('abc123')).toBe('screenetic_report_progress_abc123');
  });
});

// ===== buildScreenshotKey =====

describe('buildScreenshotKey', () => {
  it('prefixes deviceId with the expected key format', () => {
    expect(buildScreenshotKey('iphone-15')).toBe('screenetic_screenshot_iphone-15');
  });
});

// ===== canRetryDevice =====

describe('canRetryDevice', () => {
  it('returns true for a failed device with retryCount < MAX_RETRY_COUNT', () => {
    const device = makeDevice('failed', 0);
    expect(canRetryDevice(device)).toBe(true);
  });

  it('returns true for a failed device with retryCount = MAX_RETRY_COUNT - 1', () => {
    const device = makeDevice('failed', MAX_RETRY_COUNT - 1);
    expect(canRetryDevice(device)).toBe(true);
  });

  it('returns false for a failed device with retryCount = MAX_RETRY_COUNT', () => {
    const device = makeDevice('failed', MAX_RETRY_COUNT);
    expect(canRetryDevice(device)).toBe(false);
  });

  it('returns false for a failed device with retryCount > MAX_RETRY_COUNT', () => {
    const device = makeDevice('failed', MAX_RETRY_COUNT + 1);
    expect(canRetryDevice(device)).toBe(false);
  });

  it('returns false for a completed device', () => {
    const device = makeDevice('complete', 0);
    expect(canRetryDevice(device)).toBe(false);
  });

  it('returns false for a queued device', () => {
    const device = makeDevice('queued', 0);
    expect(canRetryDevice(device)).toBe(false);
  });

  it('returns false for a skipped device', () => {
    const device = makeDevice('skipped', 0);
    expect(canRetryDevice(device)).toBe(false);
  });
});

// ===== PROGRESS_MAX_AGE_MS =====

describe('PROGRESS_MAX_AGE_MS', () => {
  it('equals 24 hours in milliseconds', () => {
    expect(PROGRESS_MAX_AGE_MS).toBe(24 * 60 * 60 * 1000);
  });
});

// ===== MAX_RETRY_COUNT =====

describe('MAX_RETRY_COUNT', () => {
  it('equals 3', () => {
    expect(MAX_RETRY_COUNT).toBe(3);
  });
});

// ===== serializeForStorage =====

describe('serializeForStorage', () => {
  it('produces a valid PersistedQueueState with correct id', () => {
    const devices = [makeDevice('queued')];
    const result = serializeForStorage('sess1', 'https://example.com', devices, '4g', 'mid-range', '2024-01-15T12:00:00Z', 0);

    expect(result.id).toBe('screenetic_report_progress_sess1');
    expect(result.url).toBe('https://example.com');
    expect(result.networkProfile).toBe('4g');
    expect(result.cpuProfile).toBe('mid-range');
    expect(result.startedAt).toBe('2024-01-15T12:00:00Z');
    expect(result.queueIndex).toBe(0);
    expect(result.lastUpdatedAt).toBeTruthy();
  });

  it('strips result blobs from devices (sets result to null)', () => {
    const devices = [makeDevice('complete', 0, true)];
    const result = serializeForStorage('sess1', 'https://example.com', devices, '', '', '', 1);

    expect(result.devices[0].result).toBeNull();
    expect(result.devices[0].status).toBe('complete');
  });

  it('extracts completedResults from completed devices with results', () => {
    const devices = [
      makeDevice('complete', 0, true),
      makeDevice('failed', 1),
      makeDevice('queued'),
    ];
    const result = serializeForStorage('sess1', 'https://example.com', devices, '', '', '', 1);

    expect(result.completedResults).toHaveLength(1);
    expect(result.completedResults[0].deviceId).toBe('iphone-15');
    expect(result.completedResults[0].screenshotKey).toBe('screenetic_screenshot_iphone-15');
    expect(result.completedResults[0].metrics.loadTimeMs).toBe(1200);
  });

  it('uses "custom" as deviceId when config.deviceId is null', () => {
    const device = makeDevice('complete', 0, true);
    device.config.deviceId = null;
    const result = serializeForStorage('sess1', 'https://example.com', [device], '', '', '', 1);

    expect(result.completedResults[0].deviceId).toBe('custom');
    expect(result.completedResults[0].screenshotKey).toBe('screenetic_screenshot_custom');
  });

  it('preserves error and retryCount in serialized devices', () => {
    const device = makeDevice('failed', 2);
    const result = serializeForStorage('sess1', 'https://example.com', [device], '', '', '', 0);

    expect(result.devices[0].error).toBe('Timeout');
    expect(result.devices[0].retryCount).toBe(2);
  });

  it('returns empty completedResults when no devices are complete', () => {
    const devices = [makeDevice('queued'), makeDevice('failed', 1)];
    const result = serializeForStorage('sess1', 'https://example.com', devices, '', '', '', 0);

    expect(result.completedResults).toHaveLength(0);
  });
});
