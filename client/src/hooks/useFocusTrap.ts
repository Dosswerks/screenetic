import { useEffect, useRef, useCallback } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Custom hook that traps focus within a container element.
 * Handles Tab / Shift+Tab to cycle through focusable elements,
 * and optionally calls `onEscape` when Escape is pressed.
 */
export function useFocusTrap(options?: { onEscape?: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const container = containerRef.current;
      if (!container) return;

      if (e.key === 'Escape' && options?.onEscape) {
        e.preventDefault();
        options.onEscape();
        return;
      }

      if (e.key !== 'Tab') return;

      const focusableEls = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusableEls.length === 0) return;

      const first = focusableEls[0];
      const last = focusableEls[focusableEls.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [options?.onEscape],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Focus the first focusable element on mount
    const focusableEls = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (focusableEls.length > 0) {
      focusableEls[0].focus();
    }

    container.addEventListener('keydown', handleKeyDown);
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  return containerRef;
}
