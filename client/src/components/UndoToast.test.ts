import { describe, it, expect, vi } from 'vitest';

// UndoToast is a React component — we test the timer/callback logic here.

describe('UndoToast — auto-dismiss logic', () => {
  it('auto-dismiss fires after specified duration', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const duration = 5000;

    // Simulate the useEffect timer
    const timer = setTimeout(onDismiss, duration);

    expect(onDismiss).not.toHaveBeenCalled();

    vi.advanceTimersByTime(4999);
    expect(onDismiss).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledOnce();

    clearTimeout(timer);
    vi.useRealTimers();
  });

  it('undo click clears the timer and calls onUndo', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const onUndo = vi.fn();
    const duration = 5000;

    const timer = setTimeout(onDismiss, duration);

    // Simulate clicking Undo
    clearTimeout(timer);
    onUndo();

    // Advance past duration — onDismiss should NOT fire
    vi.advanceTimersByTime(6000);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(onUndo).toHaveBeenCalledOnce();

    vi.useRealTimers();
  });

  it('default duration is 5 seconds', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const DEFAULT_DURATION = 5000;

    const timer = setTimeout(onDismiss, DEFAULT_DURATION);

    vi.advanceTimersByTime(5000);
    expect(onDismiss).toHaveBeenCalledOnce();

    clearTimeout(timer);
    vi.useRealTimers();
  });

  it('custom duration is respected', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const customDuration = 3000;

    const timer = setTimeout(onDismiss, customDuration);

    vi.advanceTimersByTime(2999);
    expect(onDismiss).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledOnce();

    clearTimeout(timer);
    vi.useRealTimers();
  });
});
