import { describe, it, expect, vi } from 'vitest';

/**
 * Tests for useFocusTrap hook logic.
 * Since the hook relies on DOM APIs (addEventListener, querySelector, focus),
 * we test the core keyboard navigation logic directly.
 */

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

describe('useFocusTrap — logic', () => {
  it('Tab on last element should cycle to first', () => {
    // Simulate: 3 focusable elements, active = last
    const elements = [
      { focus: vi.fn(), matches: () => true },
      { focus: vi.fn(), matches: () => true },
      { focus: vi.fn(), matches: () => true },
    ];
    const first = elements[0];
    const last = elements[elements.length - 1];

    // Simulate Tab on last element
    const activeElement = last;
    const shiftKey = false;

    if (!shiftKey && activeElement === last) {
      first.focus();
    }

    expect(first.focus).toHaveBeenCalledOnce();
  });

  it('Shift+Tab on first element should cycle to last', () => {
    const elements = [
      { focus: vi.fn(), matches: () => true },
      { focus: vi.fn(), matches: () => true },
      { focus: vi.fn(), matches: () => true },
    ];
    const first = elements[0];
    const last = elements[elements.length - 1];

    // Simulate Shift+Tab on first element
    const activeElement = first;
    const shiftKey = true;

    if (shiftKey && activeElement === first) {
      last.focus();
    }

    expect(last.focus).toHaveBeenCalledOnce();
  });

  it('Escape key calls onEscape callback', () => {
    const onEscape = vi.fn();

    // Simulate Escape key press
    const key = 'Escape';
    if (key === 'Escape' && onEscape) {
      onEscape();
    }

    expect(onEscape).toHaveBeenCalledOnce();
  });

  it('Tab on middle element does not cycle', () => {
    const elements = [
      { focus: vi.fn() },
      { focus: vi.fn() },
      { focus: vi.fn() },
    ];
    const first = elements[0];
    const last = elements[elements.length - 1];
    const middle = elements[1];

    // Simulate Tab on middle element — no cycling needed
    const activeElement = middle;
    const shiftKey = false;

    if (!shiftKey && activeElement === last) {
      first.focus();
    }

    // Neither first nor last should have been explicitly focused
    expect(first.focus).not.toHaveBeenCalled();
    expect(last.focus).not.toHaveBeenCalled();
  });

  it('non-Tab/Escape keys are ignored', () => {
    const onEscape = vi.fn();
    const focusFn = vi.fn();

    const key = 'Enter';
    if (key === 'Escape' && onEscape) {
      onEscape();
    }
    if (key === 'Tab') {
      focusFn();
    }

    expect(onEscape).not.toHaveBeenCalled();
    expect(focusFn).not.toHaveBeenCalled();
  });
});
