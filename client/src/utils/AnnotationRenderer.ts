import type { DetectedIssue, IssueType } from '@shared/types';

/** Max PNG size before falling back to JPEG */
const MAX_PNG_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const JPEG_QUALITY = 0.85;

/** Badge diameter in pixels */
const BADGE_DIAMETER = 18;
const BADGE_FONT_SIZE = 11;

/** Legend bar height and styling */
const LEGEND_BAR_HEIGHT = 32;
const LEGEND_FONT_SIZE = 12;
const LEGEND_PADDING = 10;

/** Overlay colors by severity */
const SEVERITY_COLORS = {
  issue: { fill: 'rgba(220, 50, 50, 0.25)', stroke: 'rgb(220, 50, 50)' },
  observation: { fill: 'rgba(220, 180, 50, 0.25)', stroke: 'rgb(220, 180, 50)' },
} as const;

/** Human-readable labels for issue types */
const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  horizontal_overflow: 'Horizontal overflow',
  viewport_clipping: 'Viewport content clipping',
  fixed_element_occlusion: 'Fixed element occlusion',
  cls_above_threshold: 'CLS above threshold',
  tap_target_too_small: 'Tap target too small',
  text_too_small: 'Text too small to read',
  missing_viewport_meta: 'Missing viewport meta tag',
  unresponsive_layout: 'Unresponsive layout',
};

/**
 * Get the overlay/border color pair for a given severity.
 */
export function getColorForSeverity(severity: 'issue' | 'observation'): { fill: string; stroke: string } {
  return SEVERITY_COLORS[severity];
}

/**
 * Compute the badge position (top-left corner of the bounding box).
 * The badge center is offset so it sits at the top-left corner of the rectangle.
 */
export function getBadgePosition(location: { x: number; y: number }): { cx: number; cy: number } {
  const radius = BADGE_DIAMETER / 2;
  return {
    cx: location.x + radius,
    cy: location.y + radius,
  };
}

/**
 * Filter issues to only those with a location (bounding box).
 * Issues without a location are not drawn on the canvas.
 */
export function getLocatedIssues(issues: DetectedIssue[]): DetectedIssue[] {
  return issues.filter((issue) => issue.location !== null);
}

/**
 * Build the legend text from located issues.
 * Returns a string like "1: Horizontal overflow  2: Tap target too small"
 */
export function buildLegendText(locatedIssues: DetectedIssue[]): string {
  return locatedIssues
    .map((issue, index) => `${index + 1}: ${ISSUE_TYPE_LABELS[issue.type]}`)
    .join('  ');
}

/**
 * Get the human-readable label for an issue type.
 */
export function getIssueTypeLabel(type: IssueType): string {
  return ISSUE_TYPE_LABELS[type];
}

/**
 * Load a Blob as an HTMLImageElement.
 */
function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load screenshot image'));
    };
    img.src = url;
  });
}

/**
 * Draw a numbered badge (circled number) at the given position.
 */
function drawBadge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  number: number,
  color: string,
): void {
  const radius = BADGE_DIAMETER / 2;

  // Colored circle background
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // White number text
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${BADGE_FONT_SIZE}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number), cx, cy);
}

/**
 * Draw the legend bar at the bottom of the canvas.
 */
function drawLegendBar(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  legendY: number,
  legendText: string,
): void {
  // Semi-transparent dark background
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, legendY, canvasWidth, LEGEND_BAR_HEIGHT);
  ctx.restore();

  // White text
  ctx.fillStyle = '#ffffff';
  ctx.font = `${LEGEND_FONT_SIZE}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.textBaseline = 'middle';

  const textY = legendY + LEGEND_BAR_HEIGHT / 2;
  const maxTextWidth = canvasWidth - LEGEND_PADDING * 2;

  // Truncate if needed
  let displayText = legendText;
  if (ctx.measureText(displayText).width > maxTextWidth) {
    while (ctx.measureText(displayText + '…').width > maxTextWidth && displayText.length > 0) {
      displayText = displayText.slice(0, -1);
    }
    displayText += '…';
  }

  ctx.fillText(displayText, LEGEND_PADDING, textY);
}

/**
 * Convert a canvas to a Blob, trying PNG first, falling back to JPEG if >10MB.
 */
async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const pngBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/png');
  });

  if (pngBlob && pngBlob.size <= MAX_PNG_SIZE_BYTES) {
    return pngBlob;
  }

  const jpegBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY);
  });

  if (jpegBlob) {
    return jpegBlob;
  }

  if (pngBlob) {
    return pngBlob;
  }

  throw new Error('Failed to convert annotated canvas to blob');
}

/**
 * Annotate a screenshot with issue overlays, badges, and a legend bar.
 *
 * 1. Loads the raw screenshot blob into an Image, draws it onto a canvas
 * 2. Adds space at the bottom for the legend bar (if there are located issues)
 * 3. Draws overlays, borders, and badges for each issue with a location
 * 4. Draws the legend bar
 * 5. Exports as PNG (JPEG fallback if >10MB)
 * 6. Returns the annotated blob
 */
export async function annotate(screenshot: Blob, issues: DetectedIssue[]): Promise<Blob> {
  const img = await loadImage(screenshot);
  const locatedIssues = getLocatedIssues(issues);
  const hasLegend = locatedIssues.length > 0;

  // Create canvas with extra space for legend bar if needed
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height + (hasLegend ? LEGEND_BAR_HEIGHT : 0);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas 2d context');
  }

  // Draw the original screenshot
  ctx.drawImage(img, 0, 0);

  // Draw overlays, borders, and badges for each located issue
  for (let i = 0; i < locatedIssues.length; i++) {
    const issue = locatedIssues[i];
    const loc = issue.location!;
    const colors = getColorForSeverity(issue.severity);

    // Semi-transparent overlay rectangle
    ctx.fillStyle = colors.fill;
    ctx.fillRect(loc.x, loc.y, loc.width, loc.height);

    // 2px solid border
    ctx.strokeStyle = colors.stroke;
    ctx.lineWidth = 2;
    ctx.strokeRect(loc.x, loc.y, loc.width, loc.height);

    // Numbered badge at top-left corner
    const badge = getBadgePosition(loc);
    drawBadge(ctx, badge.cx, badge.cy, i + 1, colors.stroke);
  }

  // Draw legend bar if there are located issues
  if (hasLegend) {
    const legendText = buildLegendText(locatedIssues);
    drawLegendBar(ctx, canvas.width, img.height, legendText);
  }

  return canvasToBlob(canvas);
}
