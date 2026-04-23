import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock browser APIs and utility modules before imports
vi.mock('../utils/ScreenshotCapture', () => ({
  capture: vi.fn().mockResolvedValue({
    blob: new Blob(['screenshot']),
    filename: 'test_390x844_portrait_20240101-120000.png',
    format: 'png' as const,
  }),
}));

vi.mock('../utils/IssueDetector', () => ({
  analyze: vi.fn().mockResolvedValue([]),
}));

vi.mock('../utils/PerfCollector', () => ({
  collectMetrics: vi.fn().mockResolvedValue({
    loadTimeMs: 1200,
    fcpMs: 800,
    lcpMs: 1500,
    cls: 0.05,
    resourceCount: 42,
    transferSizeKB: 512,
    cacheMode: 'cold',
    serviceWorkerActive: false,
    label: 'Simulated',
  }),
}));

vi.mock('../utils/AnnotationRenderer', () => ({
  annotate: vi.fn().mockResolvedValue(new Blob(['annotated'])),
}));

import {
  calculateEstimatedRemaining,
  getDeviceDisplayName,
  buildProgress,
  toDeviceConfig,
  RenderQueue,
  REPORT_TIMEOUT_MS,
  DEVICE_LOAD_TIMEOUT_MS,
  SETTLING_TIME_MS,
} from './RenderQueue';
import type { DeviceSelectorState, QueuedDevice } from '@shared/types';

// ===== Pure helper tests =====

describe('calculateEstimatedRemaining', () => {
  it('returns null when fewer than 2 devices completed', () => {
    expect(calculateEstimatedRemaining(0, 10, 5000)).toBeNull();
    expect(calculateEstimatedRemaining(1, 10, 5000)).toBeNull();
  });

  it('returns null when all devices are completed', () => {
    expect(calculateEstimatedRemaining(10, 10, 50000)).toBeNull();
  });

  it('calculates estimated remaining based on average time per device', () => {
    // 4 of 10 done in 20000ms → avg 5000ms/device → 6 remaining → 30000ms
    const result = calculateEstimatedRemaining(4, 10, 20000);
    expect(result).toBe(30000);
  });

  it('returns a rounded value', () => {
    // 3 of 7 done in 10000ms → avg 3333.33ms → 4 remaining → 13333ms
    const result = calculateEstimatedRemaining(3, 7, 10000);
    expect(result).toBe(13333);
  });
});

describe('getDeviceDisplayName', () => {
  it('builds a display name from device config in portrait', () => {
    const config: DeviceSelectorState = {
      deviceId: 'iphone-15-pro',
      width: 393,
      height: 852,
      dpr: 3,
      browser: 'Safari',
      orientation: 'portrait',
    };
    expect(getDeviceDisplayName(config)).toBe('iphone-15-pro (393×852 @3x Safari)');
  });

  it('swaps dimensions for landscape orientation', () => {
    const config: DeviceSelectorState = {
      deviceId: 'iphone-15-pro',
      width: 393,
      height: 852,
      dpr: 3,
      browser: 'Safari',
      orientation: 'landscape',
    };
    expect(getDeviceDisplayName(config)).toBe('iphone-15-pro (852×393 @3x Safari)');
  });

  it('uses "Custom" when deviceId is null', () => {
    const config: DeviceSelectorState = {
      deviceId: null,
      width: 400,
      height: 800,
      dpr: 2,
      browser: 'Chrome',
      orientation: 'portrait',
    };
    expect(getDeviceDisplayName(config)).toBe('Custom (400×800 @2x Chrome)');
  });
});

describe('buildProgress', () => {
  const makeDevice = (status: QueuedDevice['status']): QueuedDevice => ({
    config: {
      deviceId: 'test',
      width: 390,
      height: 844,
      dpr: 3,
      browser: 'Safari',
      orientation: 'portrait' as const,
    },
    status,
    result: null,
    error: null,
    retryCount: 0,
  });

  it('counts completed, failed, and skipped as done', () => {
    const devices: QueuedDevice[] = [
      makeDevice('complete'),
      makeDevice('failed'),
      makeDevice('skipped'),
      makeDevice('queued'),
      makeDevice('loading'),
    ];
    const startTime = Date.now() - 10000;
    const progress = buildProgress(devices, startTime, 'Device 4', 'loading');

    expect(progress.completed).toBe(3);
    expect(progress.total).toBe(5);
    expect(progress.currentDevice).toBe('Device 4');
    expect(progress.currentStage).toBe('loading');
    expect(progress.elapsedMs).toBeGreaterThanOrEqual(9900);
  });

  it('returns null estimatedRemainingMs when fewer than 2 completed', () => {
    const devices: QueuedDevice[] = [makeDevice('complete'), makeDevice('queued')];
    const progress = buildProgress(devices, Date.now() - 5000, 'D2', 'loading');
    expect(progress.estimatedRemainingMs).toBeNull();
  });
});

describe('toDeviceConfig', () => {
  it('converts DeviceSelectorState to DeviceConfig in portrait', () => {
    const state: DeviceSelectorState = {
      deviceId: 'pixel-8',
      width: 412,
      height: 915,
      dpr: 2.625,
      browser: 'Chrome',
      orientation: 'portrait',
    };
    const config = toDeviceConfig(state);
    expect(config.id).toBe('pixel-8');
    expect(config.cssWidth).toBe(412);
    expect(config.cssHeight).toBe(915);
    expect(config.dpr).toBe(2.625);
    expect(config.defaultBrowser).toBe('Chrome');
  });

  it('swaps dimensions for landscape', () => {
    const state: DeviceSelectorState = {
      deviceId: 'pixel-8',
      width: 412,
      height: 915,
      dpr: 2.625,
      browser: 'Chrome',
      orientation: 'landscape',
    };
    const config = toDeviceConfig(state);
    expect(config.cssWidth).toBe(915);
    expect(config.cssHeight).toBe(412);
  });
});

// ===== Constants tests =====

describe('RenderQueue constants', () => {
  it('has a 30-minute global timeout', () => {
    expect(REPORT_TIMEOUT_MS).toBe(30 * 60 * 1000);
  });

  it('has a 30-second per-device load timeout', () => {
    expect(DEVICE_LOAD_TIMEOUT_MS).toBe(30_000);
  });

  it('has a 2-second settling time', () => {
    expect(SETTLING_TIME_MS).toBe(2_000);
  });
});

// ===== RenderQueue class tests =====

describe('RenderQueue', () => {
  let queue: RenderQueue;

  const device1: DeviceSelectorState = {
    deviceId: 'iphone-15',
    width: 393,
    height: 852,
    dpr: 3,
    browser: 'Safari',
    orientation: 'portrait',
  };

  const device2: DeviceSelectorState = {
    deviceId: 'pixel-8',
    width: 412,
    height: 915,
    dpr: 2.625,
    browser: 'Chrome',
    orientation: 'portrait',
  };

  beforeEach(() => {
    queue = new RenderQueue();
    vi.clearAllMocks();
  });

  describe('enqueue', () => {
    it('adds a device to the queue with queued status', () => {
      queue.enqueue(device1);
      expect(queue.devices).toHaveLength(1);
      expect(queue.devices[0].status).toBe('queued');
      expect(queue.devices[0].config).toBe(device1);
      expect(queue.devices[0].result).toBeNull();
      expect(queue.devices[0].error).toBeNull();
      expect(queue.devices[0].retryCount).toBe(0);
    });

    it('adds multiple devices', () => {
      queue.enqueue(device1);
      queue.enqueue(device2);
      expect(queue.devices).toHaveLength(2);
    });
  });

  describe('cancel', () => {
    it('marks remaining queued devices as skipped', () => {
      queue.enqueue(device1);
      queue.enqueue(device2);
      // Manually set one as complete to simulate partial progress
      queue.devices[0].status = 'complete';

      queue.cancel();

      expect(queue.devices[0].status).toBe('complete');
      expect(queue.devices[1].status).toBe('skipped');
      expect(queue.devices[1].error).toBe('Cancelled by user');
      expect(queue.status).toBe('complete');
    });
  });

  describe('retryFailed', () => {
    it('resets failed devices with retryCount < 3 to queued', () => {
      queue.enqueue(device1);
      queue.enqueue(device2);
      queue.devices[0].status = 'failed';
      queue.devices[0].error = 'Timeout';
      queue.devices[0].retryCount = 1;
      queue.devices[1].status = 'failed';
      queue.devices[1].error = 'Timeout';
      queue.devices[1].retryCount = 3;

      queue.retryFailed();

      expect(queue.devices[0].status).toBe('queued');
      expect(queue.devices[0].error).toBeNull();
      expect(queue.devices[1].status).toBe('failed'); // retryCount >= 3, not reset
    });
  });

  describe('concurrency', () => {
    it('defaults to sequential (concurrency = 1)', () => {
      expect(queue.concurrency).toBe(1);
    });

    it('can be set to accelerated mode', () => {
      queue.concurrency = 3;
      expect(queue.concurrency).toBe(3);
    });
  });

  describe('status', () => {
    it('starts as idle', () => {
      expect(queue.status).toBe('idle');
    });
  });

  describe('onProgress', () => {
    it('is a no-op by default', () => {
      // Should not throw
      queue.onProgress({
        completed: 0,
        total: 0,
        currentDevice: '',
        currentStage: '',
        elapsedMs: 0,
        estimatedRemainingMs: null,
      });
    });
  });
});
