import { THROTTLE_PROFILES, type ThrottleProfile } from '@shared/types';

// ===== Module state =====

let activeProfileKey: string | null = null;
let activeProfile: ThrottleProfile | null = null;
let swRegistration: ServiceWorkerRegistration | null = null;

// ===== Pure helper (exported for testing) =====

/**
 * Calculate the artificial delay in ms for a given response size and throttle profile.
 *
 * Formula:
 *   latencyDelay = profile.latencyMs
 *   transferDelay = (responseSizeBytes * 8) / (profile.downloadKbps * 1000) * 1000
 *   totalDelay = latencyDelay + transferDelay
 *
 * Returns Infinity for offline profiles or zero-bandwidth profiles.
 */
export function calculateDelay(responseSizeBytes: number, profile: ThrottleProfile): number {
  if (!Number.isFinite(profile.latencyMs)) {
    return Infinity;
  }
  if (profile.downloadKbps <= 0) {
    return Infinity;
  }

  const latencyDelay = profile.latencyMs;
  const bits = responseSizeBytes * 8;
  const transferDelay = (bits / (profile.downloadKbps * 1000)) * 1000;

  return Math.round(latencyDelay + transferDelay);
}

// ===== Service Worker management =====

/**
 * Register the throttle service worker and send it the active profile.
 * Falls back silently if SW is not supported.
 */
async function registerThrottleSW(profile: ThrottleProfile): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  try {
    const reg = await navigator.serviceWorker.register('/throttle-sw.js', {
      scope: '/',
    });

    // Wait for the SW to become active
    const sw = reg.active ?? reg.installing ?? reg.waiting;
    if (!sw) return;

    await new Promise<void>((resolve) => {
      if (sw.state === 'activated') {
        resolve();
        return;
      }
      sw.addEventListener('statechange', () => {
        if (sw.state === 'activated') resolve();
      });
      // Timeout after 5s
      setTimeout(resolve, 5000);
    });

    const activeSW = reg.active;
    if (activeSW) {
      activeSW.postMessage({
        type: 'SET_THROTTLE',
        profile: {
          downloadKbps: profile.downloadKbps,
          uploadKbps: profile.uploadKbps,
          latencyMs: profile.latencyMs,
        },
      });
    }

    swRegistration = reg;
  } catch {
    // SW registration failed — throttling will rely on cross-origin delay approach
    swRegistration = null;
  }
}

/**
 * Unregister the throttle service worker.
 */
async function unregisterThrottleSW(): Promise<void> {
  if (swRegistration) {
    try {
      // Tell the SW to disable throttling before unregistering
      const activeSW = swRegistration.active;
      if (activeSW) {
        activeSW.postMessage({ type: 'CLEAR_THROTTLE' });
      }
      await swRegistration.unregister();
    } catch {
      // Best-effort cleanup
    }
    swRegistration = null;
  }
}

// ===== Public API =====

/**
 * Activate network throttling with the given profile key.
 * For same-origin pages, registers a Service Worker that intercepts fetch requests.
 * For cross-origin pages, the caller should use `calculateDelay` to add artificial delays.
 *
 * @param profileKey - One of '3g', '4g', '5g', 'slow-3g', 'offline'
 */
export async function applyThrottle(profileKey: string): Promise<void> {
  const profile = THROTTLE_PROFILES[profileKey];
  if (!profile) {
    throw new Error(`Unknown throttle profile: "${profileKey}". Valid profiles: ${Object.keys(THROTTLE_PROFILES).join(', ')}`);
  }

  // Remove any existing throttle first
  if (activeProfileKey) {
    await removeThrottle();
  }

  activeProfileKey = profileKey;
  activeProfile = profile;

  // Register SW for same-origin interception
  await registerThrottleSW(profile);
}

/**
 * Deactivate network throttling and clean up the Service Worker.
 */
export async function removeThrottle(): Promise<void> {
  await unregisterThrottleSW();
  activeProfileKey = null;
  activeProfile = null;
}

/**
 * Returns whether throttling is currently active.
 */
export function isThrottleActive(): boolean {
  return activeProfile !== null;
}

/**
 * Returns the current active throttle profile, or null if none.
 */
export function getActiveProfile(): ThrottleProfile | null {
  return activeProfile;
}
