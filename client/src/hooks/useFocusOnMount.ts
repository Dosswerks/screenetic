import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Custom hook that focuses the first focusable element within a container
 * when the component mounts. Used for screen transitions.
 */
export function useFocusOnMount<T extends HTMLElement = HTMLElement>() {
  const containerRef = useRef<T>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Small delay to ensure DOM is settled after route transition
    const timer = requestAnimationFrame(() => {
      const focusable = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable) {
        focusable.focus();
      }
    });

    return () => cancelAnimationFrame(timer);
  }, []);

  return containerRef;
}
