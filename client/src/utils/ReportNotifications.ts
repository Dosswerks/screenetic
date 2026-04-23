/**
 * Report completion notifications and title bar progress.
 *
 * Provides:
 * - Browser Notification API integration (background tab only)
 * - Page visibility detection
 * - Document title progress indicator
 *
 * Validates: Requirements 10
 */

const DEFAULT_TITLE = 'Screenetic';
let originalTitle: string = DEFAULT_TITLE;
let titleCaptured = false;

/**
 * Requests browser notification permission.
 * Returns the resulting permission state.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    return 'denied';
  }
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  return Notification.requestPermission();
}

/**
 * Shows a browser notification when the report is done.
 * Only fires when the page is hidden (user switched tabs / locked device).
 */
export function notifyReportComplete(deviceCount: number, issueCount: number): void {
  if (!isPageHidden()) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  new Notification('Screenetic', {
    body: `Report complete: ${deviceCount} devices tested — ${issueCount} issues found`,
    icon: '/icon-192.png',
    tag: 'report-complete',
  });
}

/**
 * Updates document.title with generation progress.
 * Captures the original title on first call.
 *
 * Format during progress: "[3/10] Generating Report — Screenetic"
 * Format on completion (completed === total): "[Done] Report Complete — Screenetic"
 */
export function updateTitleProgress(completed: number, total: number): void {
  captureOriginalTitle();

  if (total <= 0) return;

  if (completed >= total) {
    document.title = '[Done] Report Complete — Screenetic';
  } else {
    document.title = `[${completed}/${total}] Generating Report — Screenetic`;
  }
}

/**
 * Restores the original document.title captured before progress updates began.
 */
export function resetTitle(): void {
  document.title = originalTitle;
  titleCaptured = false;
}

/**
 * Returns true if the page is currently visible to the user.
 */
export function isPageVisible(): boolean {
  return document.visibilityState === 'visible';
}

/**
 * Returns true if the page is currently hidden (tab backgrounded, device locked, etc.).
 */
export function isPageHidden(): boolean {
  return document.hidden === true;
}

/**
 * Formats a progress title string. Exported for testing.
 */
export function formatProgressTitle(completed: number, total: number): string {
  if (total <= 0) return DEFAULT_TITLE;
  if (completed >= total) return '[Done] Report Complete — Screenetic';
  return `[${completed}/${total}] Generating Report — Screenetic`;
}

/** Captures the current document.title as the original, once. */
function captureOriginalTitle(): void {
  if (!titleCaptured) {
    originalTitle = document.title;
    titleCaptured = true;
  }
}
