import { CPU_PROFILES, type PerformanceMetrics } from '@shared/types';

// ===== Simulation Labels =====

export type SimulationLabel = 'Simulated' | 'Approximated' | 'Not simulated' | 'Overridden';

// ===== Preset Geolocation Profiles =====

export const PRESET_LOCATIONS: Record<string, { name: string; latitude: number; longitude: number }> = {
  'new-york': { name: 'New York, US', latitude: 40.7128, longitude: -74.006 },
  'london': { name: 'London, UK', latitude: 51.5074, longitude: -0.1278 },
  'tokyo': { name: 'Tokyo, JP', latitude: 35.6762, longitude: 139.6503 },
  'sydney': { name: 'Sydney, AU', latitude: -33.8688, longitude: 151.2093 },
  'sao-paulo': { name: 'São Paulo, BR', latitude: -23.5505, longitude: -46.6333 },
};

// ===== CPU Metric Scaling =====

/**
 * Scale a single timing metric by the CPU multiplier.
 * Returns null if the input value is null (metric unavailable).
 */
export function scaleMetric(value: number | null, multiplier: number): number | null {
  if (value === null) return null;
  return Math.round(value * multiplier);
}

/**
 * Apply CPU profile scaling to all timing metrics in a PerformanceMetrics object.
 * Only loadTimeMs, fcpMs, and lcpMs are scaled — CLS, resourceCount, and
 * transferSizeKB are not CPU-dependent and are left unchanged.
 *
 * Returns a new PerformanceMetrics object (does not mutate the input).
 */
export function scalePerformanceMetrics(
  metrics: PerformanceMetrics,
  cpuProfile: string,
): PerformanceMetrics {
  const profile = CPU_PROFILES[cpuProfile];
  if (!profile) {
    throw new Error(
      `Unknown CPU profile: "${cpuProfile}". Valid profiles: ${Object.keys(CPU_PROFILES).join(', ')}`,
    );
  }

  const { multiplier } = profile;

  return {
    ...metrics,
    loadTimeMs: scaleMetric(metrics.loadTimeMs, multiplier),
    fcpMs: scaleMetric(metrics.fcpMs, multiplier),
    lcpMs: scaleMetric(metrics.lcpMs, multiplier),
  };
}

// ===== Geolocation Injection =====

/**
 * Build a script string that overrides navigator.geolocation.getCurrentPosition
 * and navigator.geolocation.watchPosition with fixed coordinates.
 *
 * Inject this into same-origin iframes before the tested page loads.
 * For cross-origin iframes, geolocation override is not possible.
 */
export function buildGeolocationInjectionScript(latitude: number, longitude: number): string {
  return `(function() {
  var coords = {
    latitude: ${latitude},
    longitude: ${longitude},
    accuracy: 100,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null
  };
  var position = {
    coords: coords,
    timestamp: Date.now()
  };
  navigator.geolocation.getCurrentPosition = function(success) {
    success(position);
  };
  navigator.geolocation.watchPosition = function(success) {
    success(position);
    return 0;
  };
})();`;
}
