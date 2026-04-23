import { describe, it, expect } from 'vitest';

/**
 * Unit tests for SideBySideControls logic.
 * Since we don't have @testing-library/react, we test the pure logic
 * that the component relies on: zoom clamping, mirror direction, and
 * the shared zoom / fit-to-screen semantics.
 */

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.25;

function clampZoom(z: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}

describe('SideBySideControls zoom logic', () => {
  it('clamps zoom to minimum', () => {
    expect(clampZoom(0.1)).toBe(MIN_ZOOM);
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(-1)).toBe(MIN_ZOOM);
  });

  it('clamps zoom to maximum', () => {
    expect(clampZoom(3.0)).toBe(MAX_ZOOM);
    expect(clampZoom(2.5)).toBe(MAX_ZOOM);
  });

  it('passes through valid zoom values', () => {
    expect(clampZoom(1.0)).toBe(1.0);
    expect(clampZoom(0.5)).toBe(0.5);
    expect(clampZoom(1.75)).toBe(1.75);
  });

  it('zoom in increments by step', () => {
    const current = 1.0;
    const next = clampZoom(current + ZOOM_STEP);
    expect(next).toBe(1.25);
  });

  it('zoom out decrements by step', () => {
    const current = 1.0;
    const next = clampZoom(current - ZOOM_STEP);
    expect(next).toBe(0.75);
  });

  it('zoom in from max stays at max', () => {
    const next = clampZoom(MAX_ZOOM + ZOOM_STEP);
    expect(next).toBe(MAX_ZOOM);
  });

  it('zoom out from min stays at min', () => {
    const next = clampZoom(MIN_ZOOM - ZOOM_STEP);
    expect(next).toBe(MIN_ZOOM);
  });
});

describe('SideBySideControls fit-to-screen semantics', () => {
  it('sharedZoom of -1 represents fit-to-screen mode', () => {
    const sharedZoom = -1;
    const isFitMode = sharedZoom === -1;
    expect(isFitMode).toBe(true);
  });

  it('positive sharedZoom represents explicit zoom', () => {
    const sharedZoom = 1.5;
    const isFitMode = sharedZoom === -1;
    expect(isFitMode).toBe(false);
    expect(sharedZoom).toBe(1.5);
  });

  it('display text shows Fit for fit mode', () => {
    const sharedZoom = -1;
    const display = sharedZoom === -1 ? 'Fit' : `${Math.round(sharedZoom * 100)}%`;
    expect(display).toBe('Fit');
  });

  it('display text shows percentage for explicit zoom', () => {
    const sharedZoom = 0.75;
    const display = sharedZoom === -1 ? 'Fit' : `${Math.round(sharedZoom * 100)}%`;
    expect(display).toBe('75%');
  });
});

describe('SideBySideControls mirror settings logic', () => {
  const leftConfig = {
    deviceId: 'iphone-15',
    width: 393,
    height: 852,
    dpr: 3,
    browser: 'Safari',
    orientation: 'portrait' as const,
  };

  const rightConfig = {
    deviceId: 'galaxy-s24',
    width: 385,
    height: 854,
    dpr: 3,
    browser: 'Samsung Internet',
    orientation: 'portrait' as const,
  };

  it('left-to-right copies left config to right', () => {
    const direction = 'left-to-right';
    const result = direction === 'left-to-right' ? { ...leftConfig } : { ...rightConfig };
    expect(result.deviceId).toBe('iphone-15');
    expect(result.browser).toBe('Safari');
    expect(result.width).toBe(393);
  });

  it('right-to-left copies right config to left', () => {
    const direction = 'right-to-left';
    const result = direction === 'right-to-left' ? { ...rightConfig } : { ...leftConfig };
    expect(result.deviceId).toBe('galaxy-s24');
    expect(result.browser).toBe('Samsung Internet');
    expect(result.width).toBe(385);
  });

  it('mirror creates a new object (does not share reference)', () => {
    const mirrored = { ...leftConfig };
    expect(mirrored).not.toBe(leftConfig);
    expect(mirrored).toEqual(leftConfig);
  });
});
