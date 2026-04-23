/**
 * Mobile sharing utilities with cascading fallback strategy.
 *
 * Sharing cascade:
 * 1. navigator.share with file support (if file provided and canShare returns true)
 * 2. navigator.share with URL only (no file)
 * 3. mailto: link with URL in body
 * 4. Download the file directly
 * 5. Return { method: 'none', success: false }
 *
 * Validates: Requirements 10
 */

export interface ShareOptions {
  title: string;
  url: string;
  text?: string;
  file?: File; // PDF file for sharing
}

export type ShareResult =
  | { method: 'native'; success: boolean }
  | { method: 'link-only'; success: boolean }
  | { method: 'mailto'; success: boolean }
  | { method: 'download'; success: boolean }
  | { method: 'none'; success: false };

/** Checks if navigator.share is available. */
export function canNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/** Checks if navigator.canShare supports file sharing. */
export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (typeof navigator.canShare !== 'function') return false;
  try {
    const testFile = new File([''], 'test.pdf', { type: 'application/pdf' });
    return navigator.canShare({ files: [testFile] });
  } catch {
    return false;
  }
}

/**
 * Attempts to share a report via the best available method,
 * cascading through fallbacks until one succeeds.
 */
export async function shareReport(options: ShareOptions): Promise<ShareResult> {
  const { title, url, text, file } = options;

  // 1. Try navigator.share with file support
  if (file && canNativeShare() && canShareFiles()) {
    try {
      await navigator.share({
        title,
        text: text ?? title,
        url,
        files: [file],
      });
      return { method: 'native', success: true };
    } catch (err) {
      // AbortError means user cancelled — still counts as handled
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { method: 'native', success: false };
      }
      // Fall through to next strategy
    }
  }

  // 2. Fall back to navigator.share with URL only
  if (canNativeShare()) {
    try {
      await navigator.share({ title, text: text ?? title, url });
      return { method: 'link-only', success: true };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { method: 'link-only', success: false };
      }
      // Fall through to next strategy
    }
  }

  // 3. Fall back to mailto: link
  try {
    const subject = encodeURIComponent(title);
    const body = encodeURIComponent(`${text ?? title}\n\n${url}`);
    const mailtoUrl = `mailto:?subject=${subject}&body=${body}`;
    window.open(mailtoUrl, '_blank');
    return { method: 'mailto', success: true };
  } catch {
    // Fall through to next strategy
  }

  // 4. Fall back to triggering a file download
  if (file) {
    try {
      const blobUrl = URL.createObjectURL(file);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = file.name;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(blobUrl);
      return { method: 'download', success: true };
    } catch {
      // Fall through
    }
  }

  // 5. Nothing worked
  return { method: 'none', success: false };
}
