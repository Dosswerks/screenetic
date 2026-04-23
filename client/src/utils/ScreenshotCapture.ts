import html2canvas from 'html2canvas';
import JSZip from 'jszip';
import type { ScreenshotConfig, ScreenshotResult } from '@shared/types';

/** Max PNG size before falling back to JPEG */
const MAX_PNG_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const JPEG_QUALITY = 0.85;
const WATERMARK_HEIGHT = 32;
const WATERMARK_FONT_SIZE = 14;
const WATERMARK_OPACITY = 0.8;

/** Track filenames generated in the current session for collision handling */
const sessionFilenames = new Map<string, number>();

/**
 * Build a watermark string from the screenshot config.
 * Format: "{device} — {width}×{height} @{dpr}x — {browser} — {url}"
 */
function buildWatermarkText(config: ScreenshotConfig): string {
  return `${config.deviceName} — ${config.width}×${config.height} @${config.dpr}x — ${config.browser} — ${config.url}`;
}

/**
 * Generate a filename with collision handling.
 * Format: {device}_{width}x{height}_{orientation}_{timestamp}[_N].png
 */
function generateFilename(config: ScreenshotConfig, format: 'png' | 'jpeg'): string {
  const sanitizedDevice = config.deviceName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');

  const base = `${sanitizedDevice}_${config.width}x${config.height}_${config.orientation}_${timestamp}`;
  const ext = format === 'jpeg' ? 'jpg' : 'png';

  const count = sessionFilenames.get(base) ?? 0;
  sessionFilenames.set(base, count + 1);

  if (count === 0) {
    return `${base}.${ext}`;
  }
  return `${base}_${count + 1}.${ext}`;
}

/**
 * Draw a watermark bar at the bottom of a canvas.
 * Semi-transparent dark background, white 14px text, 80% opacity.
 */
function drawWatermark(canvas: HTMLCanvasElement, text: string): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const barY = canvas.height - WATERMARK_HEIGHT;

  // Semi-transparent dark background
  ctx.save();
  ctx.globalAlpha = WATERMARK_OPACITY;
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, barY, canvas.width, WATERMARK_HEIGHT);

  // White text
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffffff';
  ctx.font = `${WATERMARK_FONT_SIZE}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.textBaseline = 'middle';

  const textY = barY + WATERMARK_HEIGHT / 2;
  const maxTextWidth = canvas.width - 20;

  // Truncate text if it exceeds canvas width
  let displayText = text;
  const measured = ctx.measureText(displayText);
  if (measured.width > maxTextWidth) {
    while (ctx.measureText(displayText + '…').width > maxTextWidth && displayText.length > 0) {
      displayText = displayText.slice(0, -1);
    }
    displayText += '…';
  }

  ctx.fillText(displayText, 10, textY);
  ctx.restore();
}

/**
 * Convert a canvas to a Blob, trying PNG first, falling back to JPEG if >10MB.
 */
async function canvasToBlob(canvas: HTMLCanvasElement): Promise<{ blob: Blob; format: 'png' | 'jpeg' }> {
  // Try PNG first
  const pngBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/png');
  });

  if (pngBlob && pngBlob.size <= MAX_PNG_SIZE_BYTES) {
    return { blob: pngBlob, format: 'png' };
  }

  // Fallback to JPEG
  const jpegBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY);
  });

  if (jpegBlob) {
    return { blob: jpegBlob, format: 'jpeg' };
  }

  // Last resort: return the PNG even if large
  if (pngBlob) {
    return { blob: pngBlob, format: 'png' };
  }

  throw new Error('Failed to convert canvas to blob');
}

/**
 * Capture a viewport container element as a screenshot with watermark.
 *
 * Note: html2canvas cannot capture cross-origin iframe content.
 * For cross-origin iframes, the capture may produce a blank area where the iframe is.
 * The function captures the viewport-container div which includes the scaled iframe.
 */
export async function capture(
  viewportContainer: HTMLElement,
  config: ScreenshotConfig,
): Promise<ScreenshotResult> {
  // Use html2canvas to capture the viewport container
  const canvas = await html2canvas(viewportContainer, {
    useCORS: true,
    allowTaint: false,
    backgroundColor: '#ffffff',
    width: config.width,
    height: config.height,
    scale: 1, // CSS pixel resolution
    logging: false,
    // Ignore the touch overlay so it doesn't interfere
    ignoreElements: (element: Element) => {
      return element.classList?.contains('viewport-touch-overlay') ?? false;
    },
  });

  // Create a new canvas with space for the watermark bar
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = canvas.width;
  finalCanvas.height = canvas.height + WATERMARK_HEIGHT;

  const ctx = finalCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas 2d context');
  }

  // Draw the captured content
  ctx.drawImage(canvas, 0, 0);

  // Draw watermark bar
  const watermarkText = buildWatermarkText(config);
  drawWatermark(finalCanvas, watermarkText);

  // Convert to blob
  const { blob, format } = await canvasToBlob(finalCanvas);
  const filename = generateFilename(config, format);

  return { blob, filename, format };
}

/**
 * Package multiple screenshots into a ZIP file for batch download.
 */
export async function batchDownload(screenshots: ScreenshotResult[]): Promise<Blob> {
  const zip = new JSZip();

  for (const screenshot of screenshots) {
    zip.file(screenshot.filename, screenshot.blob);
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/**
 * Trigger a browser download for a single file.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke within 5 seconds per Requirement 36
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Reset the session filename tracker (useful for testing).
 */
export function resetFilenameTracker(): void {
  sessionFilenames.clear();
}
