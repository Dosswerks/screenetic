import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  requestNotificationPermission,
  notifyReportComplete,
  updateTitleProgress,
  resetTitle,
  isPageVisible,
  isPageHidden,
  formatProgressTitle,
} from './ReportNotifications';

/**
 * Unit tests for ReportNotifications utility.
 * Tests pure helpers (title formatting, visibility) and notification logic.
 *
 * Validates: Requirements 10
 */

describe('formatProgressTitle', () => {
  it('returns progress format for in-progress state', () => {
    expect(formatProgressTitle(3, 10)).toBe('[3/10] Generating Report — Screenetic');
  });

  it('returns done format when completed equals total', () => {
    expect(formatProgressTitle(10, 10)).toBe('[Done] Report Complete — Screenetic');
  });

  it('returns done format when completed exceeds total', () => {
    expect(formatProgressTitle(12, 10)).toBe('[Done] Report Complete — Screenetic');
  });

  it('returns default title when total is 0', () => {
    expect(formatProgressTitle(0, 0)).toBe('Screenetic');
  });

  it('returns default title when total is negative', () => {
    expect(formatProgressTitle(0, -1)).toBe('Screenetic');
  });

  it('handles first device in progress', () => {
    expect(formatProgressTitle(0, 5)).toBe('[0/5] Generating Report — Screenetic');
  });

  it('handles single device report', () => {
    expect(formatProgressTitle(0, 1)).toBe('[0/1] Generating Report — Screenetic');
  });
});

describe('isPageVisible / isPageHidden', () => {
  const originalVisibilityState = document.visibilityState;
  const originalHidden = document.hidden;

  afterEach(() => {
    Object.defineProperty(document, 'visibilityState', {
      value: originalVisibilityState,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(document, 'hidden', {
      value: originalHidden,
      writable: true,
      configurable: true,
    });
  });

  it('isPageVisible returns true when visibilityState is visible', () => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    });
    expect(isPageVisible()).toBe(true);
  });

  it('isPageVisible returns false when visibilityState is hidden', () => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      writable: true,
      configurable: true,
    });
    expect(isPageVisible()).toBe(false);
  });

  it('isPageHidden returns true when document.hidden is true', () => {
    Object.defineProperty(document, 'hidden', {
      value: true,
      writable: true,
      configurable: true,
    });
    expect(isPageHidden()).toBe(true);
  });

  it('isPageHidden returns false when document.hidden is false', () => {
    Object.defineProperty(document, 'hidden', {
      value: false,
      writable: true,
      configurable: true,
    });
    expect(isPageHidden()).toBe(false);
  });
});

describe('updateTitleProgress', () => {
  let savedTitle: string;

  beforeEach(() => {
    savedTitle = document.title;
    document.title = 'Original Page Title';
    // Reset internal state by calling resetTitle
    resetTitle();
  });

  afterEach(() => {
    document.title = savedTitle;
  });

  it('updates document.title with progress', () => {
    updateTitleProgress(3, 10);
    expect(document.title).toBe('[3/10] Generating Report — Screenetic');
  });

  it('shows done when completed equals total', () => {
    updateTitleProgress(5, 5);
    expect(document.title).toBe('[Done] Report Complete — Screenetic');
  });

  it('does not change title when total is 0', () => {
    const before = document.title;
    updateTitleProgress(0, 0);
    expect(document.title).toBe(before);
  });
});

describe('resetTitle', () => {
  let savedTitle: string;

  beforeEach(() => {
    savedTitle = document.title;
    document.title = 'My App';
    resetTitle();
  });

  afterEach(() => {
    document.title = savedTitle;
  });

  it('restores the original title after progress updates', () => {
    // Set a known title, then start progress, then reset
    document.title = 'Before Progress';
    updateTitleProgress(1, 5);
    expect(document.title).toBe('[1/5] Generating Report — Screenetic');

    resetTitle();
    expect(document.title).toBe('Before Progress');
  });
});

describe('requestNotificationPermission', () => {
  const originalNotification = globalThis.Notification;

  afterEach(() => {
    if (originalNotification) {
      Object.defineProperty(globalThis, 'Notification', {
        value: originalNotification,
        writable: true,
        configurable: true,
      });
    }
  });

  it('returns denied when Notification API is not available', async () => {
    Object.defineProperty(globalThis, 'Notification', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    // Need to also remove from window
    Object.defineProperty(window, 'Notification', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    const result = await requestNotificationPermission();
    expect(result).toBe('denied');
    // Restore
    Object.defineProperty(window, 'Notification', {
      value: originalNotification,
      writable: true,
      configurable: true,
    });
  });

  it('returns current permission when already granted', async () => {
    const mockNotification = {
      permission: 'granted' as NotificationPermission,
      requestPermission: vi.fn(),
    };
    Object.defineProperty(window, 'Notification', {
      value: mockNotification,
      writable: true,
      configurable: true,
    });
    const result = await requestNotificationPermission();
    expect(result).toBe('granted');
    expect(mockNotification.requestPermission).not.toHaveBeenCalled();
  });

  it('calls requestPermission when permission is default', async () => {
    const mockNotification = {
      permission: 'default' as NotificationPermission,
      requestPermission: vi.fn().mockResolvedValue('granted'),
    };
    Object.defineProperty(window, 'Notification', {
      value: mockNotification,
      writable: true,
      configurable: true,
    });
    const result = await requestNotificationPermission();
    expect(result).toBe('granted');
    expect(mockNotification.requestPermission).toHaveBeenCalled();
  });
});

describe('notifyReportComplete', () => {
  const originalHidden = document.hidden;
  const originalNotification = globalThis.Notification;
  let notificationSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    notificationSpy = vi.fn();
    Object.defineProperty(window, 'Notification', {
      value: Object.assign(notificationSpy, { permission: 'granted' }),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(document, 'hidden', {
      value: originalHidden,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'Notification', {
      value: originalNotification,
      writable: true,
      configurable: true,
    });
  });

  it('shows notification when page is hidden and permission granted', () => {
    Object.defineProperty(document, 'hidden', {
      value: true,
      writable: true,
      configurable: true,
    });
    notifyReportComplete(10, 3);
    expect(notificationSpy).toHaveBeenCalledWith('Screenetic', expect.objectContaining({
      body: 'Report complete: 10 devices tested — 3 issues found',
      tag: 'report-complete',
    }));
  });

  it('does not show notification when page is visible', () => {
    Object.defineProperty(document, 'hidden', {
      value: false,
      writable: true,
      configurable: true,
    });
    notifyReportComplete(10, 3);
    expect(notificationSpy).not.toHaveBeenCalled();
  });

  it('does not show notification when permission is not granted', () => {
    Object.defineProperty(document, 'hidden', {
      value: true,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'Notification', {
      value: Object.assign(vi.fn(), { permission: 'denied' }),
      writable: true,
      configurable: true,
    });
    notifyReportComplete(10, 3);
    // The constructor spy on window.Notification should not be called
    expect((window as any).Notification).not.toHaveBeenCalled();
  });
});
