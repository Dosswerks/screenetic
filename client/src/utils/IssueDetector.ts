import type { DeviceConfig, DetectedIssue, IssueType } from '@shared/types';

// ===== Constants =====

/** Tap target minimum size in CSS pixels (per Google/WCAG guidelines) */
export const MIN_TAP_TARGET_SIZE = 48;

/** Minimum readable font size in CSS pixels */
export const MIN_FONT_SIZE = 12;

/** CLS threshold — above this is flagged (per Web Vitals "good" threshold) */
export const CLS_THRESHOLD = 0.1;

/** Fixed element occlusion threshold — percentage of viewport area */
export const OCCLUSION_THRESHOLD = 0.3;

/** Tolerance for unresponsive layout detection (pixels) */
export const UNRESPONSIVE_TOLERANCE = 20;

// ===== Severity Classification =====

const ISSUE_TYPES: IssueType[] = [
  'horizontal_overflow',
  'tap_target_too_small',
  'text_too_small',
  'missing_viewport_meta',
  'unresponsive_layout',
];

const OBSERVATION_TYPES: IssueType[] = [
  'viewport_clipping',
  'fixed_element_occlusion',
  'cls_above_threshold',
];

/**
 * Classify an issue type as 'issue' or 'observation'.
 * Exported for testing.
 */
export function classifySeverity(type: IssueType): 'issue' | 'observation' {
  if (ISSUE_TYPES.includes(type)) return 'issue';
  if (OBSERVATION_TYPES.includes(type)) return 'observation';
  return 'issue'; // default fallback
}

// ===== Pure threshold/check helpers (exported for testing) =====

/** Check if scrollWidth indicates horizontal overflow */
export function hasHorizontalOverflow(scrollWidth: number, clientWidth: number): boolean {
  return scrollWidth > clientWidth;
}

/** Check if a CLS score exceeds the threshold */
export function isClsAboveThreshold(clsScore: number): boolean {
  return clsScore > CLS_THRESHOLD;
}

/** Check if a tap target is too small */
export function isTapTargetTooSmall(width: number, height: number): boolean {
  return width < MIN_TAP_TARGET_SIZE || height < MIN_TAP_TARGET_SIZE;
}

/** Check if text is too small to read */
export function isTextTooSmall(fontSize: number): boolean {
  return fontSize < MIN_FONT_SIZE;
}

/** Check if a fixed element occludes too much of the viewport */
export function isFixedElementOccluding(
  elementArea: number,
  viewportArea: number,
): boolean {
  if (viewportArea <= 0) return false;
  return elementArea / viewportArea > OCCLUSION_THRESHOLD;
}

/** Check if layout is unresponsive (scrollWidth significantly differs from device width) */
export function isUnresponsiveLayout(scrollWidth: number, deviceCssWidth: number): boolean {
  return Math.abs(scrollWidth - deviceCssWidth) > UNRESPONSIVE_TOLERANCE;
}

// ===== Cross-origin detection helper =====

function isCrossOrigin(iframe: HTMLIFrameElement): boolean {
  try {
    // Attempt to access contentDocument — throws SecurityError for cross-origin
    const doc = iframe.contentDocument;
    return !doc;
  } catch {
    return true;
  }
}

// ===== Individual detectors (same-origin) =====

function detectHorizontalOverflow(doc: Document, _device: DeviceConfig): DetectedIssue | null {
  const scrollWidth = doc.documentElement.scrollWidth;
  const clientWidth = doc.documentElement.clientWidth;

  if (hasHorizontalOverflow(scrollWidth, clientWidth)) {
    return {
      type: 'horizontal_overflow',
      severity: classifySeverity('horizontal_overflow'),
      description: `Content extends beyond viewport width (scrollWidth: ${scrollWidth}px, clientWidth: ${clientWidth}px).`,
      location: null,
      details: { scrollWidth, clientWidth, overflowPx: scrollWidth - clientWidth },
    };
  }
  return null;
}

function detectViewportClipping(doc: Document): DetectedIssue[] {
  const issues: DetectedIssue[] = [];
  const elements = doc.querySelectorAll('*');

  for (const el of elements) {
    const style = doc.defaultView?.getComputedStyle(el);
    if (!style) continue;

    const overflow = style.overflow;
    const overflowX = style.overflowX;
    const overflowY = style.overflowY;

    const isHidden =
      overflow === 'hidden' || overflowX === 'hidden' || overflowY === 'hidden';

    if (!isHidden) continue;

    const parentRect = el.getBoundingClientRect();
    const children = el.children;

    for (const child of children) {
      const childRect = child.getBoundingClientRect();
      const isClipped =
        childRect.right > parentRect.right + 1 ||
        childRect.bottom > parentRect.bottom + 1 ||
        childRect.left < parentRect.left - 1 ||
        childRect.top < parentRect.top - 1;

      if (isClipped) {
        issues.push({
          type: 'viewport_clipping',
          severity: classifySeverity('viewport_clipping'),
          description: `Content clipped by overflow:hidden container.`,
          location: {
            x: Math.round(parentRect.left),
            y: Math.round(parentRect.top),
            width: Math.round(parentRect.width),
            height: Math.round(parentRect.height),
          },
          details: {
            parentTag: el.tagName.toLowerCase(),
            childTag: child.tagName.toLowerCase(),
          },
        });
        break; // one issue per container is enough
      }
    }
  }

  return issues;
}

function detectFixedElementOcclusion(doc: Document, device: DeviceConfig): DetectedIssue[] {
  const issues: DetectedIssue[] = [];
  const viewportWidth = device.cssWidth;
  const viewportHeight = device.cssHeight;
  const viewportArea = viewportWidth * viewportHeight;
  const elements = doc.querySelectorAll('*');

  for (const el of elements) {
    const style = doc.defaultView?.getComputedStyle(el);
    if (!style) continue;

    if (style.position !== 'fixed') continue;

    const rect = el.getBoundingClientRect();
    const elementArea = rect.width * rect.height;

    if (isFixedElementOccluding(elementArea, viewportArea)) {
      issues.push({
        type: 'fixed_element_occlusion',
        severity: classifySeverity('fixed_element_occlusion'),
        description: `Fixed element covers ${Math.round((elementArea / viewportArea) * 100)}% of viewport area.`,
        location: {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        details: {
          tag: el.tagName.toLowerCase(),
          coveragePercent: Math.round((elementArea / viewportArea) * 100),
        },
      });
    }
  }

  return issues;
}

function detectClsAboveThreshold(doc: Document): Promise<DetectedIssue | null> {
  return new Promise((resolve) => {
    const win = doc.defaultView;
    if (!win || !('PerformanceObserver' in win)) {
      resolve(null);
      return;
    }

    let clsScore = 0;
    let resolved = false;

    try {
      const observer = new win.PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // Layout Instability API entries have a `value` property
          if ('value' in entry && typeof (entry as any).value === 'number') {
            clsScore += (entry as any).value;
          }
        }
      });

      observer.observe({ type: 'layout-shift', buffered: true });

      // Give a short window to collect buffered entries, then resolve
      setTimeout(() => {
        if (resolved) return;
        resolved = true;
        observer.disconnect();

        if (isClsAboveThreshold(clsScore)) {
          resolve({
            type: 'cls_above_threshold',
            severity: classifySeverity('cls_above_threshold'),
            description: `Cumulative Layout Shift score is ${clsScore.toFixed(3)}, exceeding the 0.1 threshold.`,
            location: null,
            details: { clsScore },
          });
        } else {
          resolve(null);
        }
      }, 500);
    } catch {
      resolve(null);
    }
  });
}

function detectTapTargetTooSmall(doc: Document): DetectedIssue[] {
  const issues: DetectedIssue[] = [];
  const interactiveElements = doc.querySelectorAll('a, button, input, select, textarea, [role="button"]');

  for (const el of interactiveElements) {
    const rect = el.getBoundingClientRect();

    if (rect.width === 0 && rect.height === 0) continue; // hidden elements

    if (isTapTargetTooSmall(rect.width, rect.height)) {
      issues.push({
        type: 'tap_target_too_small',
        severity: classifySeverity('tap_target_too_small'),
        description: `Tap target is ${Math.round(rect.width)}×${Math.round(rect.height)}px, below the 48×48px minimum.`,
        location: {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        details: {
          tag: el.tagName.toLowerCase(),
          actualWidth: Math.round(rect.width),
          actualHeight: Math.round(rect.height),
        },
      });
    }
  }

  return issues;
}

function detectTextTooSmall(doc: Document): DetectedIssue[] {
  const issues: DetectedIssue[] = [];
  const walker = doc.createTreeWalker(doc.body || doc.documentElement, NodeFilter.SHOW_TEXT);
  const checkedParents = new Set<Element>();

  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent?.trim();
    if (!text) continue;

    const parent = node.parentElement;
    if (!parent || checkedParents.has(parent)) continue;
    checkedParents.add(parent);

    const style = doc.defaultView?.getComputedStyle(parent);
    if (!style) continue;

    const fontSize = parseFloat(style.fontSize);
    if (isNaN(fontSize)) continue;

    if (isTextTooSmall(fontSize)) {
      const rect = parent.getBoundingClientRect();
      issues.push({
        type: 'text_too_small',
        severity: classifySeverity('text_too_small'),
        description: `Text rendered at ${fontSize}px, below the 12px minimum.`,
        location: {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        details: {
          tag: parent.tagName.toLowerCase(),
          computedFontSize: fontSize,
          textSnippet: text.substring(0, 50),
        },
      });
    }
  }

  return issues;
}

function detectMissingViewportMeta(doc: Document): DetectedIssue | null {
  const meta = doc.querySelector('meta[name="viewport"]');
  if (!meta) {
    return {
      type: 'missing_viewport_meta',
      severity: classifySeverity('missing_viewport_meta'),
      description: 'Page does not include a <meta name="viewport"> tag.',
      location: null,
      details: {},
    };
  }
  return null;
}

function detectUnresponsiveLayout(doc: Document, device: DeviceConfig): DetectedIssue | null {
  const scrollWidth = doc.documentElement.scrollWidth;

  if (isUnresponsiveLayout(scrollWidth, device.cssWidth)) {
    return {
      type: 'unresponsive_layout',
      severity: classifySeverity('unresponsive_layout'),
      description: `Page renders at ${scrollWidth}px width, which differs from the ${device.cssWidth}px device viewport.`,
      location: null,
      details: {
        scrollWidth,
        deviceCssWidth: device.cssWidth,
        difference: Math.abs(scrollWidth - device.cssWidth),
      },
    };
  }
  return null;
}

// ===== Cross-origin fallback detectors =====

function detectHorizontalOverflowCrossOrigin(iframe: HTMLIFrameElement, _device: DeviceConfig): DetectedIssue | null {
  try {
    // For cross-origin, we can only check the iframe element's scrollWidth vs clientWidth
    if (iframe.scrollWidth > iframe.clientWidth) {
      return {
        type: 'horizontal_overflow',
        severity: classifySeverity('horizontal_overflow'),
        description: `Iframe content appears to overflow horizontally (cross-origin — limited detection).`,
        location: null,
        details: {
          scrollWidth: iframe.scrollWidth,
          clientWidth: iframe.clientWidth,
          crossOrigin: true,
        },
      };
    }
  } catch {
    // Cannot access even iframe dimensions
  }
  return null;
}

// ===== Main analyze function =====

/**
 * Analyze an iframe for mobile responsiveness issues.
 *
 * For same-origin iframes, performs full DOM inspection.
 * For cross-origin iframes, only observable symptoms are detected.
 */
export async function analyze(
  iframe: HTMLIFrameElement,
  device: DeviceConfig,
): Promise<DetectedIssue[]> {
  const issues: DetectedIssue[] = [];

  if (isCrossOrigin(iframe)) {
    // Cross-origin: only observable symptoms
    const overflow = detectHorizontalOverflowCrossOrigin(iframe, device);
    if (overflow) issues.push(overflow);
    // CLS via PerformanceObserver is not accessible cross-origin
    return issues;
  }

  // Same-origin: full DOM access
  const doc = iframe.contentDocument!;

  // Synchronous detectors
  const horizontalOverflow = detectHorizontalOverflow(doc, device);
  if (horizontalOverflow) issues.push(horizontalOverflow);

  const clippingIssues = detectViewportClipping(doc);
  issues.push(...clippingIssues);

  const occlusionIssues = detectFixedElementOcclusion(doc, device);
  issues.push(...occlusionIssues);

  const tapTargetIssues = detectTapTargetTooSmall(doc);
  issues.push(...tapTargetIssues);

  const textIssues = detectTextTooSmall(doc);
  issues.push(...textIssues);

  const missingMeta = detectMissingViewportMeta(doc);
  if (missingMeta) issues.push(missingMeta);

  const unresponsive = detectUnresponsiveLayout(doc, device);
  if (unresponsive) issues.push(unresponsive);

  // Async detector
  const clsIssue = await detectClsAboveThreshold(doc);
  if (clsIssue) issues.push(clsIssue);

  return issues;
}
