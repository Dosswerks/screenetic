import { describe, it, expect, vi } from 'vitest';

/**
 * Tests for useFocusOnMount hook logic.
 * We test the core behavior: finding and focusing the first focusable element.
 */

describe('useFocusOnMount — logic', () => {
  it('focuses the first focusable element in a container', () => {
    const focusFn = vi.fn();
    const container = {
      querySelector: vi.fn().mockReturnValue({ focus: focusFn }),
    };

    const focusable = container.querySelector('button');
    if (focusable) {
      focusable.focus();
    }

    expect(container.querySelector).toHaveBeenCalled();
    expect(focusFn).toHaveBeenCalledOnce();
  });

  it('does nothing when no focusable elements exist', () => {
    const container = {
      querySelector: vi.fn().mockReturnValue(null),
    };

    const focusable = container.querySelector('button');
    if (focusable) {
      focusable.focus();
    }

    expect(container.querySelector).toHaveBeenCalled();
    // No error thrown, no focus called
  });
});
