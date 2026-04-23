import { describe, it, expect } from 'vitest';
import {
  scaleMetric,
  scalePerformanceMetrics,
  buildGeolocationInjectionScript,
  PRESET_LOCATIONS,
  type SimulationLabel,
} from './EnvironmentSimulator';
import { CPU_PROFILES, type PerformanceMetrics } from '@shared/types';

// ===== scaleMetric =====

describe('scaleMetric', () => {
  it('returns null when value is null', () => {
    expect(scaleMetric(null, 4)).toBeNull();
  });

  it('returns the value unchanged when multiplier is 1 (high-end)', () => {
    expect(scaleMetric(500, 1)).toBe(500);
  });

  it('doubles the value for mid-range (2x)', () => {
    expect(scaleMetric(500, 2)).toBe(1000);
  });

  it('quadruples the value for low-end (4x)', () => {
    expect(scaleMetric(500, 4)).toBe(2000);
  });

  it('rounds the result to the nearest integer', () => {
    expect(scaleMetric(333, 2)).toBe(666);
    expect(scaleMetric(101, 4)).toBe(404);
  });

  it('handles zero value', () => {
    expect(scaleMetric(0, 4)).toBe(0);
  });
});

// ===== scalePerformanceMetrics =====

describe('scalePerformanceMetrics', () => {
  const baseMetrics: PerformanceMetrics = {
    loadTimeMs: 1000,
    fcpMs: 500,
    lcpMs: 1500,
    cls: 0.05,
    resourceCount: 42,
    transferSizeKB: 1200,
    cacheMode: 'cold',
    serviceWorkerActive: false,
    label: 'Simulated',
  };

  it('scales timing metrics by low-end multiplier (4x)', () => {
    const result = scalePerformanceMetrics(baseMetrics, 'low-end');
    expect(result.loadTimeMs).toBe(4000);
    expect(result.fcpMs).toBe(2000);
    expect(result.lcpMs).toBe(6000);
  });

  it('scales timing metrics by mid-range multiplier (2x)', () => {
    const result = scalePerformanceMetrics(baseMetrics, 'mid-range');
    expect(result.loadTimeMs).toBe(2000);
    expect(result.fcpMs).toBe(1000);
    expect(result.lcpMs).toBe(3000);
  });

  it('leaves timing metrics unchanged for high-end (1x)', () => {
    const result = scalePerformanceMetrics(baseMetrics, 'high-end');
    expect(result.loadTimeMs).toBe(1000);
    expect(result.fcpMs).toBe(500);
    expect(result.lcpMs).toBe(1500);
  });

  it('does NOT scale CLS, resourceCount, or transferSizeKB', () => {
    const result = scalePerformanceMetrics(baseMetrics, 'low-end');
    expect(result.cls).toBe(0.05);
    expect(result.resourceCount).toBe(42);
    expect(result.transferSizeKB).toBe(1200);
  });

  it('preserves cacheMode, serviceWorkerActive, and label', () => {
    const result = scalePerformanceMetrics(baseMetrics, 'low-end');
    expect(result.cacheMode).toBe('cold');
    expect(result.serviceWorkerActive).toBe(false);
    expect(result.label).toBe('Simulated');
  });

  it('handles null timing metrics gracefully', () => {
    const nullMetrics: PerformanceMetrics = {
      ...baseMetrics,
      loadTimeMs: null,
      fcpMs: null,
      lcpMs: null,
    };
    const result = scalePerformanceMetrics(nullMetrics, 'low-end');
    expect(result.loadTimeMs).toBeNull();
    expect(result.fcpMs).toBeNull();
    expect(result.lcpMs).toBeNull();
  });

  it('does not mutate the input metrics object', () => {
    const original = { ...baseMetrics };
    scalePerformanceMetrics(baseMetrics, 'low-end');
    expect(baseMetrics).toEqual(original);
  });

  it('throws for an unknown CPU profile', () => {
    expect(() => scalePerformanceMetrics(baseMetrics, 'ultra-fast')).toThrow(
      'Unknown CPU profile: "ultra-fast"',
    );
  });
});

// ===== buildGeolocationInjectionScript =====

describe('buildGeolocationInjectionScript', () => {
  it('returns a string containing the latitude and longitude', () => {
    const script = buildGeolocationInjectionScript(40.7128, -74.006);
    expect(script).toContain('40.7128');
    expect(script).toContain('-74.006');
  });

  it('overrides getCurrentPosition', () => {
    const script = buildGeolocationInjectionScript(51.5074, -0.1278);
    expect(script).toContain('navigator.geolocation.getCurrentPosition');
  });

  it('overrides watchPosition', () => {
    const script = buildGeolocationInjectionScript(35.6762, 139.6503);
    expect(script).toContain('navigator.geolocation.watchPosition');
  });

  it('includes accuracy of 100', () => {
    const script = buildGeolocationInjectionScript(0, 0);
    expect(script).toContain('accuracy: 100');
  });

  it('handles negative coordinates (southern/western hemispheres)', () => {
    const script = buildGeolocationInjectionScript(-33.8688, -46.6333);
    expect(script).toContain('-33.8688');
    expect(script).toContain('-46.6333');
  });
});

// ===== PRESET_LOCATIONS =====

describe('PRESET_LOCATIONS', () => {
  it('contains 5 preset locations', () => {
    expect(Object.keys(PRESET_LOCATIONS)).toHaveLength(5);
  });

  it('includes New York, London, Tokyo, Sydney, and São Paulo', () => {
    expect(PRESET_LOCATIONS['new-york']).toBeDefined();
    expect(PRESET_LOCATIONS['london']).toBeDefined();
    expect(PRESET_LOCATIONS['tokyo']).toBeDefined();
    expect(PRESET_LOCATIONS['sydney']).toBeDefined();
    expect(PRESET_LOCATIONS['sao-paulo']).toBeDefined();
  });

  it('each preset has name, latitude, and longitude', () => {
    for (const [, loc] of Object.entries(PRESET_LOCATIONS)) {
      expect(typeof loc.name).toBe('string');
      expect(typeof loc.latitude).toBe('number');
      expect(typeof loc.longitude).toBe('number');
    }
  });

  it('latitudes are within valid range (-90 to 90)', () => {
    for (const [, loc] of Object.entries(PRESET_LOCATIONS)) {
      expect(loc.latitude).toBeGreaterThanOrEqual(-90);
      expect(loc.latitude).toBeLessThanOrEqual(90);
    }
  });

  it('longitudes are within valid range (-180 to 180)', () => {
    for (const [, loc] of Object.entries(PRESET_LOCATIONS)) {
      expect(loc.longitude).toBeGreaterThanOrEqual(-180);
      expect(loc.longitude).toBeLessThanOrEqual(180);
    }
  });
});

// ===== SimulationLabel type =====

describe('SimulationLabel type', () => {
  it('accepts all four valid label values', () => {
    const labels: SimulationLabel[] = ['Simulated', 'Approximated', 'Not simulated', 'Overridden'];
    expect(labels).toHaveLength(4);
  });
});
