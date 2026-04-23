/**
 * TouchEventProxy — translates mouse events on a transparent overlay
 * into touch events dispatched into a same-origin iframe's content document.
 *
 * For cross-origin iframes, touch dispatch is not possible; the overlay
 * forwards native pointer events instead.
 */

/** Translate mouse coordinates on the overlay to iframe CSS pixel space. */
export function translateCoords(
  mouseX: number,
  mouseY: number,
  iframeRect: DOMRect,
  zoom: number,
): { x: number; y: number } {
  return {
    x: (mouseX - iframeRect.left) / zoom,
    y: (mouseY - iframeRect.top) / zoom,
  };
}

/** Scroll mode: 'wheel' forwards native wheel events, 'drag' translates to touch swipe. */
export type ScrollMode = 'wheel' | 'drag';

export interface TouchEventProxyOptions {
  overlay: HTMLDivElement;
  iframe: HTMLIFrameElement;
  scaleFactor: number;
  scrollMode: ScrollMode;
}

/**
 * Creates a TouchEventProxy that attaches mouse→touch translation listeners
 * to the given overlay element. Returns a detach function to clean up.
 */
export function createTouchEventProxy(options: TouchEventProxyOptions): { detach: () => void; updateScale: (s: number) => void } {
  const { overlay, iframe } = options;
  let scaleFactor = options.scaleFactor;
  let scrollMode = options.scrollMode;
  let isTouching = false;
  let touchIdentifier = 0;
  let lastMoveTime = 0;
  const THROTTLE_MS = 1000 / 60; // ~16ms for 60fps

  function getContentDocument(): Document | null {
    try {
      return iframe.contentDocument;
    } catch {
      return null;
    }
  }

  function getContentWindow(): Window | null {
    try {
      return iframe.contentWindow;
    } catch {
      return null;
    }
  }

  function isSameOrigin(): boolean {
    return getContentDocument() !== null;
  }

  function getIframeRect(): DOMRect {
    return iframe.getBoundingClientRect();
  }

  function createTouchInit(
    x: number,
    y: number,
    doc: Document,
  ): Touch {
    return new Touch({
      identifier: touchIdentifier,
      target: doc.documentElement,
      clientX: x,
      clientY: y,
      pageX: x,
      pageY: y,
      screenX: x,
      screenY: y,
    });
  }

  function dispatchTouchEvent(
    type: 'touchstart' | 'touchmove' | 'touchend',
    x: number,
    y: number,
  ): void {
    const doc = getContentDocument();
    if (!doc) return;

    const touch = createTouchInit(x, y, doc);
    const touchList = type === 'touchend' ? [] : [touch];
    const changedTouches = [touch];

    const event = new TouchEvent(type, {
      bubbles: true,
      cancelable: true,
      touches: touchList,
      targetTouches: touchList,
      changedTouches: changedTouches,
    });

    doc.elementFromPoint(x, y)?.dispatchEvent(event) ??
      doc.documentElement.dispatchEvent(event);
  }

  // --- Mouse event handlers ---

  function handleMouseDown(e: MouseEvent): void {
    if (!isSameOrigin()) return;
    e.preventDefault();

    const rect = getIframeRect();
    const { x, y } = translateCoords(e.clientX, e.clientY, rect, scaleFactor);

    isTouching = true;
    touchIdentifier++;
    dispatchTouchEvent('touchstart', x, y);
  }

  function handleMouseMove(e: MouseEvent): void {
    if (!isTouching || !isSameOrigin()) return;
    e.preventDefault();

    // Throttle to 60fps
    const now = performance.now();
    if (now - lastMoveTime < THROTTLE_MS) return;
    lastMoveTime = now;

    const rect = getIframeRect();
    const { x, y } = translateCoords(e.clientX, e.clientY, rect, scaleFactor);
    dispatchTouchEvent('touchmove', x, y);
  }

  function handleMouseUp(e: MouseEvent): void {
    if (!isTouching || !isSameOrigin()) return;
    e.preventDefault();

    const rect = getIframeRect();
    const { x, y } = translateCoords(e.clientX, e.clientY, rect, scaleFactor);
    dispatchTouchEvent('touchend', x, y);
    isTouching = false;
  }

  function handleClick(e: MouseEvent): void {
    if (!isSameOrigin()) return;
    e.preventDefault();

    const rect = getIframeRect();
    const { x, y } = translateCoords(e.clientX, e.clientY, rect, scaleFactor);

    // Full tap sequence: touchstart → touchend → click
    const doc = getContentDocument();
    if (!doc) return;

    touchIdentifier++;
    dispatchTouchEvent('touchstart', x, y);
    dispatchTouchEvent('touchend', x, y);

    // Dispatch a click event at the translated coordinates
    const target = doc.elementFromPoint(x, y) ?? doc.documentElement;
    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      view: getContentWindow() ?? undefined,
    });
    target.dispatchEvent(clickEvent);
  }

  // --- Scroll / wheel handler ---

  function handleWheel(e: WheelEvent): void {
    e.preventDefault();

    if (scrollMode === 'wheel') {
      // Forward as native wheel event into the iframe
      const contentWindow = getContentWindow();
      if (!contentWindow) return;

      const rect = getIframeRect();
      const { x, y } = translateCoords(e.clientX, e.clientY, rect, scaleFactor);

      try {
        const doc = getContentDocument();
        if (doc) {
          const wheelEvent = new WheelEvent('wheel', {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            deltaX: e.deltaX,
            deltaY: e.deltaY,
            deltaMode: e.deltaMode,
          });
          (doc.elementFromPoint(x, y) ?? doc.documentElement).dispatchEvent(wheelEvent);
        } else {
          // Cross-origin: just scroll the iframe content window
          contentWindow.scrollBy(e.deltaX, e.deltaY);
        }
      } catch {
        // Cross-origin fallback
        try {
          contentWindow.scrollBy(e.deltaX, e.deltaY);
        } catch {
          // Cannot scroll cross-origin
        }
      }
    } else {
      // drag mode: translate wheel into touchmove swipe gesture
      if (!isSameOrigin()) return;

      const rect = getIframeRect();
      const { x, y } = translateCoords(e.clientX, e.clientY, rect, scaleFactor);

      touchIdentifier++;
      dispatchTouchEvent('touchstart', x, y);
      // Simulate a swipe by moving in the opposite direction of the wheel delta
      dispatchTouchEvent('touchmove', x - e.deltaX, y - e.deltaY);
      dispatchTouchEvent('touchend', x - e.deltaX, y - e.deltaY);
    }
  }

  // --- Attach listeners ---
  overlay.addEventListener('mousedown', handleMouseDown);
  overlay.addEventListener('mousemove', handleMouseMove);
  overlay.addEventListener('mouseup', handleMouseUp);
  overlay.addEventListener('click', handleClick);
  overlay.addEventListener('wheel', handleWheel, { passive: false });

  // Also listen for mouseup on window in case the user releases outside the overlay
  const handleWindowMouseUp = (e: MouseEvent) => {
    if (isTouching) {
      handleMouseUp(e);
    }
  };
  window.addEventListener('mouseup', handleWindowMouseUp);

  return {
    detach() {
      overlay.removeEventListener('mousedown', handleMouseDown);
      overlay.removeEventListener('mousemove', handleMouseMove);
      overlay.removeEventListener('mouseup', handleMouseUp);
      overlay.removeEventListener('click', handleClick);
      overlay.removeEventListener('wheel', handleWheel);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    },
    updateScale(s: number) {
      scaleFactor = s;
    },
  };
}
