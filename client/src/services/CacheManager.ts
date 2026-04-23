// ===== CacheManager =====
// Centralized cache clearing, service worker unregistration, and cache mode
// management for consistent performance measurement during report generation.

/** Current cache mode setting — defaults to 'cold' */
let _cacheMode: 'cold' | 'warm' = 'cold';

// ===== Pure / state helpers (exported for testing) =====

/**
 * Get the current cache mode setting.
 */
export function getCacheMode(): 'cold' | 'warm' {
  return _cacheMode;
}

/**
 * Set the cache mode for subsequent renders.
 */
export function setCacheMode(mode: 'cold' | 'warm'): void {
  _cacheMode = mode;
}

// ===== Cache clearing =====

/**
 * Clear all Cache Storage entries.
 */
export async function clearAllCaches(): Promise<void> {
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // Best-effort — Cache API may be unavailable
  }
}

/**
 * Clear caches related to a specific origin.
 * In practice we clear all caches (browser Cache Storage is not origin-scoped
 * in a way we can reliably filter), but the intent is documented for callers.
 */
export async function clearCachesForOrigin(_url: string): Promise<void> {
  // Cache Storage keys are opaque strings chosen by the service worker.
  // We cannot reliably filter by origin, so clear everything for safety.
  await clearAllCaches();
}

// ===== Service Worker management =====

export interface SWUnregistrationResult {
  unregistered: number;
  failed: number;
}

/**
 * Unregister all service workers. Returns counts of successful and failed
 * unregistrations.
 */
export async function unregisterAllServiceWorkers(): Promise<SWUnregistrationResult> {
  const result: SWUnregistrationResult = { unregistered: 0, failed: 0 };

  try {
    if (!('serviceWorker' in navigator)) {
      return result;
    }

    const registrations = await navigator.serviceWorker.getRegistrations();

    const outcomes = await Promise.allSettled(
      registrations.map((r) => r.unregister()),
    );

    for (const outcome of outcomes) {
      if (outcome.status === 'fulfilled' && outcome.value) {
        result.unregistered++;
      } else {
        result.failed++;
      }
    }
  } catch {
    // Best-effort — SW API may be unavailable
  }

  return result;
}

// ===== Cache priming (warm cache mode) =====

/** Default timeout for cache priming iframe load (ms) */
const PRIME_TIMEOUT_MS = 30_000;

/**
 * Prime the browser cache by loading the URL in a hidden iframe, waiting for
 * the load event, then destroying the iframe. This ensures subsequent loads
 * hit warm cache.
 */
export async function primeCache(url: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.left = '-9999px';
    iframe.style.top = '-9999px';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.visibility = 'hidden';
    iframe.setAttribute('data-screenetic-prime', 'true');

    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error(`Cache priming timed out after ${PRIME_TIMEOUT_MS}ms`));
      }
    }, PRIME_TIMEOUT_MS);

    const cleanup = () => {
      try {
        iframe.src = 'about:blank';
        iframe.remove();
      } catch {
        // Best-effort
      }
    };

    iframe.addEventListener(
      'load',
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          cleanup();
          resolve();
        }
      },
      { once: true },
    );

    iframe.addEventListener(
      'error',
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          cleanup();
          // Resolve rather than reject — priming failure is non-fatal
          resolve();
        }
      },
      { once: true },
    );

    iframe.src = url;
    document.body.appendChild(iframe);
  });
}

// ===== Orchestration =====

export interface PrepareResult {
  swUnregistered: boolean;
}

/**
 * Orchestrate the full pre-render cleanup for a device:
 * 1. Clear caches (if cold mode)
 * 2. Unregister service workers
 * 3. If warm mode, prime the cache first
 *
 * Returns whether SW unregistration succeeded (all SWs removed or none existed).
 */
export async function prepareForRender(url: string): Promise<PrepareResult> {
  const mode = getCacheMode();

  // Always clear caches in cold mode; in warm mode we still clear first,
  // then prime so the second (measured) load is warm.
  await clearAllCaches();

  const swResult = await unregisterAllServiceWorkers();
  const swUnregistered = swResult.failed === 0;

  if (mode === 'warm') {
    // Prime the cache so the actual measured render hits warm cache
    try {
      await primeCache(url);
    } catch {
      // Priming failure is non-fatal — measurement proceeds with whatever
      // cache state exists
    }
  }

  return { swUnregistered };
}
