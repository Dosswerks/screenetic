import type { PerformanceMetrics } from '@shared/types';

// ===== Constants =====

/** Timeout for PerformanceObserver-based metrics (ms) */
export const OBSERVER_TIMEOUT_MS = 3000;

// ===== Pure helper functions (exported for testing) =====

/**
 * Compute load time from Navigation Timing API.
 * Uses PerformanceNavigationTiming (Level 2) if available, falls back to legacy timing.
 * Returns null if data is not yet available or API is missing.
 */
export function computeLoadTime(perf: Performance): number | null {
  // Try Navigation Timing Level 2 first
  try {
    const navEntries = perf.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    if (navEntries.length > 0) {
      const nav = navEntries[0];
      if (nav.loadEventEnd > 0) {
        return Math.round(nav.loadEventEnd - nav.startTime);
      }
    }
  } catch {
    // API not available, fall through
  }

  // Fallback to legacy timing API
  try {
    const timing = (perf as unknown as { timing?: PerformanceTiming }).timing;
    if (timing && timing.loadEventEnd > 0 && timing.navigationStart > 0) {
      return Math.round(timing.loadEventEnd - timing.navigationStart);
    }
  } catch {
    // API not available
  }

  return null;
}

/**
 * Compute resource metrics (count and total transfer size in KB).
 * Returns { resourceCount, transferSizeKB } or nulls if unavailable.
 */
export function computeResourceMetrics(perf: Performance): {
  resourceCount: number | null;
  transferSizeKB: number | null;
} {
  try {
    const resources = perf.getEntriesByType('resource') as PerformanceResourceTiming[];
    if (!resources || resources.length === 0) {
      return { resourceCount: 0, transferSizeKB: 0 };
    }

    const resourceCount = resources.length;
    let totalTransferSize = 0;
    let hasTransferSize = false;

    for (const entry of resources) {
      if (typeof entry.transferSize === 'number' && entry.transferSize > 0) {
        totalTransferSize += entry.transferSize;
        hasTransferSize = true;
      }
    }

    return {
      resourceCount,
      transferSizeKB: hasTransferSize ? Math.round((totalTransferSize / 1024) * 100) / 100 : null,
    };
  } catch {
    return { resourceCount: null, transferSizeKB: null };
  }
}

/**
 * Sum layout shift scores from a list of LayoutShift entries.
 * Only counts shifts where hadRecentInput is false (unexpected shifts).
 */
export function sumLayoutShiftScores(
  entries: Array<{ value: number; hadRecentInput: boolean }>,
): number {
  let total = 0;
  for (const entry of entries) {
    if (!entry.hadRecentInput) {
      total += entry.value;
    }
  }
  return Math.round(total * 10000) / 10000; // round to 4 decimal places
}

/**
 * Build a default PerformanceMetrics object with all values null.
 */
export function buildDefaultMetrics(cacheMode: 'cold' | 'warm'): PerformanceMetrics {
  return {
    loadTimeMs: null,
    fcpMs: null,
    lcpMs: null,
    cls: null,
    resourceCount: null,
    transferSizeKB: null,
    cacheMode,
    serviceWorkerActive: false,
    label: 'Simulated',
  };
}


// ===== Cross-origin detection =====

function isCrossOrigin(iframe: HTMLIFrameElement): boolean {
  try {
    const doc = iframe.contentDocument;
    return !doc;
  } catch {
    return true;
  }
}

// ===== Observer-based metric collection =====

/**
 * Collect FCP using the Paint Timing API with PerformanceObserver (buffered).
 * Returns the FCP value in ms, or null if unavailable within the timeout.
 */
function collectFCP(perf: Performance, timeoutMs: number): Promise<number | null> {
  return new Promise((resolve) => {
    // First try buffered entries directly
    try {
      const paintEntries = perf.getEntriesByType('paint');
      for (const entry of paintEntries) {
        if (entry.name === 'first-contentful-paint') {
          resolve(Math.round(entry.startTime));
          return;
        }
      }
    } catch {
      // API not available, try observer
    }

    // Try PerformanceObserver
    if (typeof PerformanceObserver === 'undefined') {
      resolve(null);
      return;
    }

    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        observer.disconnect();
        resolve(null);
      }
    }, timeoutMs);

    let observer: PerformanceObserver;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              observer.disconnect();
              resolve(Math.round(entry.startTime));
            }
            return;
          }
        }
      });
      observer.observe({ type: 'paint', buffered: true });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/**
 * Collect LCP using the Largest Contentful Paint API with PerformanceObserver (buffered).
 * Returns the LCP value in ms, or null if unavailable within the timeout.
 * LCP reports multiple entries — we take the last one (largest).
 */
function collectLCP(perf: Performance, timeoutMs: number): Promise<number | null> {
  // Suppress unused parameter warning — perf is kept for API consistency
  void perf;

  return new Promise((resolve) => {
    if (typeof PerformanceObserver === 'undefined') {
      resolve(null);
      return;
    }

    let lastLCP: number | null = null;
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        observer.disconnect();
        resolve(lastLCP);
      }
    }, timeoutMs);

    let observer: PerformanceObserver;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          lastLCP = Math.round(entry.startTime);
        }
      });
      observer.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/**
 * Collect CLS using the Layout Instability API with PerformanceObserver (buffered).
 * Returns the cumulative CLS score, or null if unavailable within the timeout.
 */
function collectCLS(perf: Performance, timeoutMs: number): Promise<number | null> {
  void perf;

  return new Promise((resolve) => {
    if (typeof PerformanceObserver === 'undefined') {
      resolve(null);
      return;
    }

    const entries: Array<{ value: number; hadRecentInput: boolean }> = [];
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        observer.disconnect();
        resolve(entries.length > 0 ? sumLayoutShiftScores(entries) : null);
      }
    }, timeoutMs);

    let observer: PerformanceObserver;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const layoutShift = entry as unknown as { value: number; hadRecentInput: boolean };
          entries.push({
            value: layoutShift.value,
            hadRecentInput: layoutShift.hadRecentInput,
          });
        }
      });
      observer.observe({ type: 'layout-shift', buffered: true });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

// ===== Service Worker detection =====

/**
 * Check if a service worker is active for the iframe's scope.
 */
async function detectServiceWorker(iframeWindow: Window): Promise<boolean> {
  try {
    if ('navigator' in iframeWindow && 'serviceWorker' in iframeWindow.navigator) {
      const registration = await iframeWindow.navigator.serviceWorker.getRegistration();
      return !!(registration && registration.active);
    }
  } catch {
    // Cross-origin or API unavailable
  }
  return false;
}

// ===== Main collection function =====

/**
 * Collect performance metrics from an iframe.
 *
 * For same-origin iframes: uses standard Web Performance APIs.
 * For cross-origin iframes: returns null for all metrics (APIs are inaccessible).
 *
 * @param iframe - The HTMLIFrameElement to collect metrics from
 * @param cacheMode - Whether this is a 'cold' or 'warm' cache measurement
 * @returns A complete PerformanceMetrics object
 */
export async function collectMetrics(
  iframe: HTMLIFrameElement,
  cacheMode: 'cold' | 'warm',
): Promise<PerformanceMetrics> {
  const metrics = buildDefaultMetrics(cacheMode);

  // Cross-origin: return all nulls
  if (isCrossOrigin(iframe)) {
    return metrics;
  }

  const iframeWindow = iframe.contentWindow;
  if (!iframeWindow) {
    return metrics;
  }

  let perf: Performance;
  try {
    perf = iframeWindow.performance;
    if (!perf) {
      return metrics;
    }
  } catch {
    return metrics;
  }

  // Collect synchronous metrics
  metrics.loadTimeMs = computeLoadTime(perf);

  const resourceMetrics = computeResourceMetrics(perf);
  metrics.resourceCount = resourceMetrics.resourceCount;
  metrics.transferSizeKB = resourceMetrics.transferSizeKB;

  // Collect observer-based metrics in parallel with timeout
  const [fcp, lcp, cls] = await Promise.all([
    collectFCP(perf, OBSERVER_TIMEOUT_MS),
    collectLCP(perf, OBSERVER_TIMEOUT_MS),
    collectCLS(perf, OBSERVER_TIMEOUT_MS),
  ]);

  metrics.fcpMs = fcp;
  metrics.lcpMs = lcp;
  metrics.cls = cls;

  // Detect service worker
  metrics.serviceWorkerActive = await detectServiceWorker(iframeWindow);

  return metrics;
}
