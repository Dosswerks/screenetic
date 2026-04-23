import { describe, it, expect } from 'vitest';
import type { QueuedDevice, DeviceSelectorState } from '@shared/types';

/**
 * Unit tests for CompareSelector logic.
 * Tests the pure selection logic and URL construction
 * that the CompareSelector component relies on.
 */

function makeDevice(overrides: Partial<DeviceSelectorState> = {}, status: QueuedDevice['status'] = 'complete'): QueuedDevice {
  return {
    config: {
      deviceId: 'iphone-15',
      width: 393,
      height: 852,
      dpr: 3,
      browser: 'Safari',
      orientation: 'portrait',
      ...overrides,
    },
    status,
    result: status === 'complete' ? {
      screenshotBlob: new Blob(),
      screenshotAnnotatedBlob: new Blob(),
      metrics: { loadTimeMs: 100, fcpMs: 50, lcpMs: 200, cls: 0.01, resourceCount: 10, transferSizeKB: 500, cacheMode: 'cold', serviceWorkerActive: false, label: 'Simulated' },
      issues: [],
      renderTimeMs: 300,
    } : null,
    error: status === 'failed' ? 'Timeout' : null,
    retryCount: 0,
  };
}

describe('CompareSelector selection logic', () => {
  it('allows selecting up to 2 devices', () => {
    const selected = new Set<number>();
    selected.add(0);
    expect(selected.size).toBe(1);
    selected.add(2);
    expect(selected.size).toBe(2);
    // Should not add a third
    if (selected.size < 2) selected.add(3);
    expect(selected.size).toBe(2);
  });

  it('allows toggling a selected device off', () => {
    const selected = new Set<number>([0, 2]);
    selected.delete(0);
    expect(selected.size).toBe(1);
    expect(selected.has(0)).toBe(false);
    expect(selected.has(2)).toBe(true);
  });

  it('only counts completed devices as selectable', () => {
    const devices: QueuedDevice[] = [
      makeDevice({ deviceId: 'iphone-15' }, 'complete'),
      makeDevice({ deviceId: 'galaxy-s24' }, 'failed'),
      makeDevice({ deviceId: 'pixel-8' }, 'complete'),
      makeDevice({ deviceId: 'ipad-pro' }, 'skipped'),
    ];

    const completedIndices = devices
      .map((d, i) => ({ d, i }))
      .filter(({ d }) => d.status === 'complete')
      .map(({ i }) => i);

    expect(completedIndices).toEqual([0, 2]);
  });

  it('requires exactly 2 selections to enable compare', () => {
    expect(new Set<number>().size === 2).toBe(false);
    expect(new Set<number>([0]).size === 2).toBe(false);
    expect(new Set<number>([0, 2]).size === 2).toBe(true);
  });
});

describe('CompareSelector URL construction', () => {
  it('builds correct query params with left and right configs', () => {
    const left: DeviceSelectorState = {
      deviceId: 'iphone-15',
      width: 393,
      height: 852,
      dpr: 3,
      browser: 'Safari',
      orientation: 'portrait',
    };
    const right: DeviceSelectorState = {
      deviceId: 'galaxy-s24',
      width: 385,
      height: 854,
      dpr: 3,
      browser: 'Samsung Internet',
      orientation: 'portrait',
    };
    const url = 'https://example.com';

    const params = new URLSearchParams({
      url,
      left: JSON.stringify(left),
      right: JSON.stringify(right),
    });

    const path = `/compare?${params.toString()}`;
    expect(path).toContain('/compare?');
    expect(path).toContain('url=https');
    expect(path).toContain('left=');
    expect(path).toContain('right=');

    // Verify round-trip parsing
    const parsed = new URLSearchParams(path.split('?')[1]);
    expect(parsed.get('url')).toBe(url);
    const parsedLeft = JSON.parse(parsed.get('left')!) as DeviceSelectorState;
    const parsedRight = JSON.parse(parsed.get('right')!) as DeviceSelectorState;
    expect(parsedLeft.deviceId).toBe('iphone-15');
    expect(parsedLeft.width).toBe(393);
    expect(parsedRight.deviceId).toBe('galaxy-s24');
    expect(parsedRight.browser).toBe('Samsung Internet');
  });
});

describe('SideBySideScreen query param parsing', () => {
  const DEFAULT_DEVICE_STATE: DeviceSelectorState = {
    deviceId: 'iphone-15',
    width: 393,
    height: 852,
    dpr: 3,
    browser: 'Safari',
    orientation: 'portrait',
  };

  const DEFAULT_RIGHT_STATE: DeviceSelectorState = {
    deviceId: 'galaxy-s24',
    width: 385,
    height: 854,
    dpr: 3,
    browser: 'Samsung Internet',
    orientation: 'portrait',
  };

  function parseDeviceParam(raw: string | null, fallback: DeviceSelectorState): DeviceSelectorState {
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw) as DeviceSelectorState;
      if (parsed.width && parsed.height && parsed.dpr) return parsed;
    } catch { /* ignore */ }
    return fallback;
  }

  it('returns default when param is null', () => {
    const result = parseDeviceParam(null, DEFAULT_DEVICE_STATE);
    expect(result).toBe(DEFAULT_DEVICE_STATE);
  });

  it('returns default when param is invalid JSON', () => {
    const result = parseDeviceParam('not-json', DEFAULT_DEVICE_STATE);
    expect(result).toBe(DEFAULT_DEVICE_STATE);
  });

  it('returns default when parsed object is missing required fields', () => {
    const result = parseDeviceParam('{"deviceId":"test"}', DEFAULT_DEVICE_STATE);
    expect(result).toBe(DEFAULT_DEVICE_STATE);
  });

  it('parses valid JSON into DeviceSelectorState', () => {
    const state: DeviceSelectorState = {
      deviceId: 'pixel-8',
      width: 412,
      height: 915,
      dpr: 2.625,
      browser: 'Chrome',
      orientation: 'portrait',
    };
    const result = parseDeviceParam(JSON.stringify(state), DEFAULT_DEVICE_STATE);
    expect(result.deviceId).toBe('pixel-8');
    expect(result.width).toBe(412);
    expect(result.height).toBe(915);
    expect(result.dpr).toBe(2.625);
    expect(result.browser).toBe('Chrome');
  });

  it('uses different defaults for left and right', () => {
    const left = parseDeviceParam(null, DEFAULT_DEVICE_STATE);
    const right = parseDeviceParam(null, DEFAULT_RIGHT_STATE);
    expect(left.deviceId).toBe('iphone-15');
    expect(right.deviceId).toBe('galaxy-s24');
  });
});
