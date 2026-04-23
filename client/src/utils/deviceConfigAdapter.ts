import type { DeviceSelectorState, DeviceConfig, BrowserConfig, DeviceEntry } from '@shared/types';

/**
 * Convert a DeviceSelectorState + DeviceEntry into the DeviceConfig
 * expected by ViewportFrame.
 */
export function toDeviceConfig(
  state: DeviceSelectorState,
  device: DeviceEntry | undefined,
): DeviceConfig {
  const name = device
    ? `${device.manufacturer} ${device.model}`
    : `Custom (${state.width}×${state.height})`;

  return {
    id: state.deviceId || 'custom',
    name,
    manufacturer: device?.manufacturer || 'Custom',
    cssWidth: state.width,
    cssHeight: state.height,
    dpr: state.dpr,
    category: device?.category || 'phone',
    defaultBrowser: device?.defaultBrowser || state.browser,
    releaseYear: device?.releaseYear || 0,
  };
}

/**
 * Build a BrowserConfig from the selected browser name.
 * `isNative` is true when the selected browser matches the host browser.
 */
export function toBrowserConfig(browserName: string): BrowserConfig {
  const hostBrowser = detectHostBrowser();
  const isNative = hostBrowser.toLowerCase() === browserName.toLowerCase();

  return {
    name: browserName,
    userAgent: buildUserAgent(browserName),
    isNative,
  };
}

function detectHostBrowser(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('Chrome') && !ua.includes('Edg/')) return 'Chrome';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  return 'Default';
}

function buildUserAgent(browser: string): string {
  // Simplified UA strings for simulation labeling purposes.
  // The actual UA override happens at the iframe level.
  switch (browser) {
    case 'Safari':
      return 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    case 'Chrome':
      return 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
    case 'Firefox':
      return 'Mozilla/5.0 (Android 14; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0';
    case 'Samsung Internet':
      return 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36';
    default:
      return navigator.userAgent;
  }
}
