/**
 * Throttle Service Worker
 *
 * Intercepts same-origin fetch requests and adds artificial delays
 * based on the active throttle profile. The delay is calculated from
 * the response size and the profile's bandwidth/latency settings.
 *
 * Communication with the main thread:
 *   postMessage({ type: 'SET_THROTTLE', profile: { downloadKbps, uploadKbps, latencyMs } })
 *   postMessage({ type: 'CLEAR_THROTTLE' })
 */

/* eslint-disable no-restricted-globals */

let throttleProfile = null;

// Listen for profile updates from the main thread
self.addEventListener('message', (event) => {
  const { type, profile } = event.data || {};

  if (type === 'SET_THROTTLE' && profile) {
    throttleProfile = {
      downloadKbps: profile.downloadKbps,
      uploadKbps: profile.uploadKbps,
      latencyMs: profile.latencyMs,
    };
  } else if (type === 'CLEAR_THROTTLE') {
    throttleProfile = null;
  }
});

/**
 * Calculate delay in ms for a response of the given size.
 */
function calculateDelay(responseSizeBytes, profile) {
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

/**
 * Sleep for the given number of milliseconds.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Intercept fetch requests and add throttle delays
self.addEventListener('fetch', (event) => {
  if (!throttleProfile) {
    // No throttling active — let the request pass through
    return;
  }

  // Offline mode: block all requests
  if (throttleProfile.downloadKbps === 0 && throttleProfile.uploadKbps === 0) {
    event.respondWith(Promise.reject(new TypeError('Network request failed (offline simulation)')));
    return;
  }

  event.respondWith(
    (async () => {
      // Add latency delay before the request
      if (throttleProfile.latencyMs > 0) {
        await sleep(throttleProfile.latencyMs);
      }

      // Fetch the actual response
      const response = await fetch(event.request);

      // Clone the response to read its size
      const cloned = response.clone();
      let sizeBytes = 0;

      try {
        const buffer = await cloned.arrayBuffer();
        sizeBytes = buffer.byteLength;
      } catch {
        // If we can't read the body, skip transfer delay
        return response;
      }

      // Calculate and apply transfer delay based on response size
      if (sizeBytes > 0 && throttleProfile.downloadKbps > 0) {
        const bits = sizeBytes * 8;
        const transferDelayMs = (bits / (throttleProfile.downloadKbps * 1000)) * 1000;
        if (transferDelayMs > 1) {
          await sleep(Math.round(transferDelayMs));
        }
      }

      return response;
    })()
  );
});

// Activate immediately on install
self.addEventListener('install', () => {
  self.skipWaiting();
});

// Claim all clients on activation
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
