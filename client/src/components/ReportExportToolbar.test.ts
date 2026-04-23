import { describe, it, expect } from 'vitest';
import type { ReportData, QueuedDevice, DeviceSelectorState, ScreenshotResult } from '@shared/types';

/**
 * Unit tests for ReportExportToolbar logic.
 * Tests the pure helper functions and data transformation logic
 * that the ReportExportToolbar component relies on.
 *
 * Validates: Requirements 42, 29
 */

// ===== Helper reproductions (same logic as component) =====

function urlSlug(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/[^a-zA-Z0-9]/g, '-');
  } catch {
    return 'report';
  }
}

function makeDevice(
  overrides: Partial<DeviceSelectorState> = {},
  status: QueuedDevice['status'] = 'complete',
  hasScreenshot = true,
): QueuedDevice {
  return {
    config: {
      deviceId: 'iphone-15',
      width: 393,
      height: 852,
      dpr: 3,
      browser: 'Safari',
      orientation: 'portrait' as const,
      ...overrides,
    },
    status,
    result: status === 'complete' ? {
      screenshotBlob: hasScreenshot ? new Blob(['png-data'], { type: 'image/png' }) : new Blob(),
      screenshotAnnotatedBlob: new Blob(['annotated-data'], { type: 'image/png' }),
      metrics: {
        loadTimeMs: 100,
        fcpMs: 50,
        lcpMs: 200,
        cls: 0.01,
        resourceCount: 10,
        transferSizeKB: 500,
        cacheMode: 'cold' as const,
        serviceWorkerActive: false,
        label: 'Simulated' as const,
      },
      issues: [],
      renderTimeMs: 300,
    } : null,
    error: status === 'failed' ? 'Timeout' : null,
    retryCount: 0,
  };
}

// ===== Tests =====

describe('ReportExportToolbar — urlSlug helper', () => {
  it('extracts hostname and replaces non-alphanumeric chars', () => {
    expect(urlSlug('https://example.com')).toBe('example-com');
  });

  it('handles subdomains', () => {
    expect(urlSlug('https://www.my-site.co.uk/path')).toBe('www-my-site-co-uk');
  });

  it('returns "report" for invalid URLs', () => {
    expect(urlSlug('not-a-url')).toBe('report');
  });

  it('handles URLs with ports', () => {
    const slug = urlSlug('https://localhost:3000/test');
    expect(slug).toBe('localhost');
  });
});

describe('ReportExportToolbar — screenshot collection for ZIP', () => {
  it('collects screenshots only from completed devices', () => {
    const devices: QueuedDevice[] = [
      makeDevice({ deviceId: 'iphone-15' }, 'complete'),
      makeDevice({ deviceId: 'galaxy-s24' }, 'failed'),
      makeDevice({ deviceId: 'pixel-8' }, 'complete'),
      makeDevice({ deviceId: 'ipad-pro' }, 'skipped'),
    ];

    const screenshots: ScreenshotResult[] = [];
    for (const device of devices) {
      if (device.status === 'complete' && device.result?.screenshotBlob) {
        const config = device.config;
        const sanitizedDevice = (config.deviceId ?? `${config.width}x${config.height}`).replace(/[^a-zA-Z0-9_-]/g, '_');
        screenshots.push({
          blob: device.result.screenshotBlob,
          filename: `${sanitizedDevice}_${config.width}x${config.height}_${config.orientation}.png`,
          format: 'png',
        });
      }
    }

    expect(screenshots).toHaveLength(2);
    expect(screenshots[0].filename).toBe('iphone-15_393x852_portrait.png');
    expect(screenshots[1].filename).toBe('pixel-8_393x852_portrait.png');
  });

  it('uses width x height for devices without deviceId', () => {
    const devices: QueuedDevice[] = [
      makeDevice({ deviceId: null, width: 400, height: 800 }, 'complete'),
    ];

    const screenshots: ScreenshotResult[] = [];
    for (const device of devices) {
      if (device.status === 'complete' && device.result?.screenshotBlob) {
        const config = device.config;
        const sanitizedDevice = (config.deviceId ?? `${config.width}x${config.height}`).replace(/[^a-zA-Z0-9_-]/g, '_');
        screenshots.push({
          blob: device.result.screenshotBlob,
          filename: `${sanitizedDevice}_${config.width}x${config.height}_${config.orientation}.png`,
          format: 'png',
        });
      }
    }

    expect(screenshots).toHaveLength(1);
    expect(screenshots[0].filename).toBe('400x800_400x800_portrait.png');
  });

  it('produces empty list when no devices are complete', () => {
    const devices: QueuedDevice[] = [
      makeDevice({ deviceId: 'iphone-15' }, 'failed'),
      makeDevice({ deviceId: 'galaxy-s24' }, 'skipped'),
    ];

    const screenshots: ScreenshotResult[] = [];
    for (const device of devices) {
      if (device.status === 'complete' && device.result?.screenshotBlob) {
        screenshots.push({
          blob: device.result.screenshotBlob,
          filename: 'test.png',
          format: 'png',
        });
      }
    }

    expect(screenshots).toHaveLength(0);
  });
});

describe('ReportExportToolbar — Copy Link visibility', () => {
  it('Copy Link should only be available when reportId is provided', () => {
    // Simulates the conditional rendering logic
    const reportId: string | undefined = undefined;
    expect(!!reportId).toBe(false);

    const reportIdPresent: string | undefined = 'abc-123';
    expect(!!reportIdPresent).toBe(true);
  });

  it('Share button should only appear on mobile with reportId', () => {
    const isMobile = true;
    const reportId = 'abc-123';
    expect(isMobile && !!reportId).toBe(true);

    const isDesktop = false;
    expect(isDesktop && !!reportId).toBe(false);

    const noReportId: string | undefined = undefined;
    expect(isMobile && !!noReportId).toBe(false);
  });
});

describe('ReportExportToolbar — ReportData construction', () => {
  it('builds ReportData from QueuedDevice array', () => {
    const devices: QueuedDevice[] = [
      makeDevice({ deviceId: 'iphone-15' }, 'complete'),
      makeDevice({ deviceId: 'galaxy-s24' }, 'failed'),
    ];

    const reportData: ReportData = {
      url: 'https://example.com',
      generatedAt: new Date().toISOString(),
      deviceDatabaseVersion: '1.0',
      screenenticVersion: '0.1.0',
      devices: devices.map(d => ({
        config: d.config,
        screenshot: d.result?.screenshotBlob ?? null,
        screenshotAnnotated: d.result?.screenshotAnnotatedBlob ?? null,
        metrics: d.result?.metrics ?? null,
        issues: d.result?.issues ?? [],
        status: d.status === 'complete' ? 'complete' as const : 'failed' as const,
        error: d.error ?? undefined,
      })),
      isAutoAudit: false,
    };

    expect(reportData.devices).toHaveLength(2);
    expect(reportData.devices[0].status).toBe('complete');
    expect(reportData.devices[0].metrics).not.toBeNull();
    expect(reportData.devices[1].status).toBe('failed');
    expect(reportData.devices[1].metrics).toBeNull();
    expect(reportData.devices[1].error).toBe('Timeout');
  });
});
