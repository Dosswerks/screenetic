import { describe, it, expect } from 'vitest';
import {
  computeLoadTime,
  computeResourceMetrics,
  sumLayoutShiftScores,
  buildDefaultMetrics,
  OBSERVER_TIMEOUT_MS,
} from './PerfCollector';

describe('PerfCollector — pure logic', () => {
  describe('OBSERVER_TIMEOUT_MS', () => {
    it('is between 2000 and 3000 ms', () => {
      expect(OBSERVER_TIMEOUT_MS).toBeGreaterThanOrEqual(2000);
      expect(OBSERVER_TIMEOUT_MS).toBeLessThanOrEqual(3000);
    });
  });

  describe('computeLoadTime', () => {
    it('returns load time from Navigation Timing Level 2', () => {
      const mockPerf = {
        getEntriesByType: (type: string) => {
          if (type === 'navigation') {
            return [{ startTime: 0, loadEventEnd: 1234 }];
          }
          return [];
        },
      } as unknown as Performance;

      expect(computeLoadTime(mockPerf)).toBe(1234);
    });

    it('returns null when loadEventEnd is 0 (not yet loaded)', () => {
      const mockPerf = {
        getEntriesByType: (type: string) => {
          if (type === 'navigation') {
            return [{ startTime: 0, loadEventEnd: 0 }];
          }
          return [];
        },
      } as unknown as Performance;

      expect(computeLoadTime(mockPerf)).toBeNull();
    });

    it('falls back to legacy timing API when Level 2 has no entries', () => {
      const mockPerf = {
        getEntriesByType: () => [],
        timing: {
          navigationStart: 100,
          loadEventEnd: 1500,
        },
      } as unknown as Performance;

      expect(computeLoadTime(mockPerf)).toBe(1400);
    });

    it('returns null when legacy timing loadEventEnd is 0', () => {
      const mockPerf = {
        getEntriesByType: () => [],
        timing: {
          navigationStart: 100,
          loadEventEnd: 0,
        },
      } as unknown as Performance;

      expect(computeLoadTime(mockPerf)).toBeNull();
    });

    it('returns null when no timing APIs are available', () => {
      const mockPerf = {
        getEntriesByType: () => {
          throw new Error('not supported');
        },
      } as unknown as Performance;

      expect(computeLoadTime(mockPerf)).toBeNull();
    });

    it('rounds the result to an integer', () => {
      const mockPerf = {
        getEntriesByType: (type: string) => {
          if (type === 'navigation') {
            return [{ startTime: 0.3, loadEventEnd: 1234.7 }];
          }
          return [];
        },
      } as unknown as Performance;

      const result = computeLoadTime(mockPerf);
      expect(result).toBe(Math.round(1234.7 - 0.3));
      expect(Number.isInteger(result)).toBe(true);
    });
  });

  describe('computeResourceMetrics', () => {
    it('returns count and total transfer size for resources', () => {
      const mockPerf = {
        getEntriesByType: (type: string) => {
          if (type === 'resource') {
            return [
              { transferSize: 1024 },
              { transferSize: 2048 },
              { transferSize: 512 },
            ];
          }
          return [];
        },
      } as unknown as Performance;

      const result = computeResourceMetrics(mockPerf);
      expect(result.resourceCount).toBe(3);
      expect(result.transferSizeKB).toBeCloseTo((1024 + 2048 + 512) / 1024, 2);
    });

    it('returns 0 count and 0 size for empty resource list', () => {
      const mockPerf = {
        getEntriesByType: () => [],
      } as unknown as Performance;

      const result = computeResourceMetrics(mockPerf);
      expect(result.resourceCount).toBe(0);
      expect(result.transferSizeKB).toBe(0);
    });

    it('returns null transferSizeKB when no entries have transferSize', () => {
      const mockPerf = {
        getEntriesByType: (type: string) => {
          if (type === 'resource') {
            return [
              { transferSize: 0 },
              { transferSize: 0 },
            ];
          }
          return [];
        },
      } as unknown as Performance;

      const result = computeResourceMetrics(mockPerf);
      expect(result.resourceCount).toBe(2);
      expect(result.transferSizeKB).toBeNull();
    });

    it('returns nulls when API throws', () => {
      const mockPerf = {
        getEntriesByType: () => {
          throw new Error('not supported');
        },
      } as unknown as Performance;

      const result = computeResourceMetrics(mockPerf);
      expect(result.resourceCount).toBeNull();
      expect(result.transferSizeKB).toBeNull();
    });
  });

  describe('sumLayoutShiftScores', () => {
    it('sums only entries without recent input', () => {
      const entries = [
        { value: 0.05, hadRecentInput: false },
        { value: 0.1, hadRecentInput: true },  // should be excluded
        { value: 0.03, hadRecentInput: false },
      ];

      expect(sumLayoutShiftScores(entries)).toBeCloseTo(0.08, 4);
    });

    it('returns 0 for empty entries', () => {
      expect(sumLayoutShiftScores([])).toBe(0);
    });

    it('returns 0 when all entries have recent input', () => {
      const entries = [
        { value: 0.1, hadRecentInput: true },
        { value: 0.2, hadRecentInput: true },
      ];

      expect(sumLayoutShiftScores(entries)).toBe(0);
    });

    it('sums all entries when none have recent input', () => {
      const entries = [
        { value: 0.01, hadRecentInput: false },
        { value: 0.02, hadRecentInput: false },
        { value: 0.03, hadRecentInput: false },
      ];

      expect(sumLayoutShiftScores(entries)).toBeCloseTo(0.06, 4);
    });

    it('rounds to 4 decimal places', () => {
      const entries = [
        { value: 0.00001, hadRecentInput: false },
        { value: 0.00002, hadRecentInput: false },
      ];

      const result = sumLayoutShiftScores(entries);
      // 0.00003 rounded to 4 decimal places = 0
      expect(result).toBe(0);
    });
  });

  describe('buildDefaultMetrics', () => {
    it('returns all null metrics with cold cache mode', () => {
      const metrics = buildDefaultMetrics('cold');
      expect(metrics.loadTimeMs).toBeNull();
      expect(metrics.fcpMs).toBeNull();
      expect(metrics.lcpMs).toBeNull();
      expect(metrics.cls).toBeNull();
      expect(metrics.resourceCount).toBeNull();
      expect(metrics.transferSizeKB).toBeNull();
      expect(metrics.cacheMode).toBe('cold');
      expect(metrics.serviceWorkerActive).toBe(false);
      expect(metrics.label).toBe('Simulated');
    });

    it('returns all null metrics with warm cache mode', () => {
      const metrics = buildDefaultMetrics('warm');
      expect(metrics.cacheMode).toBe('warm');
      expect(metrics.label).toBe('Simulated');
    });

    it('always labels as Simulated', () => {
      expect(buildDefaultMetrics('cold').label).toBe('Simulated');
      expect(buildDefaultMetrics('warm').label).toBe('Simulated');
    });
  });
});
