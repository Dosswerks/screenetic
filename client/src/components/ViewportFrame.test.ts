import { describe, it, expect } from 'vitest';
import { computeFitZoom } from './ViewportFrame';

describe('computeFitZoom', () => {
  it('scales down when device is larger than container', () => {
    // 390x844 device in a 195x422 container → 0.5 scale
    const zoom = computeFitZoom(390, 844, 195, 422);
    expect(zoom).toBeCloseTo(0.5, 5);
  });

  it('scales up when device is smaller than container', () => {
    // 200x400 device in a 400x800 container → 2.0 (capped at MAX_ZOOM)
    const zoom = computeFitZoom(200, 400, 400, 800);
    expect(zoom).toBe(2.0);
  });

  it('uses the smaller of width/height ratios', () => {
    // 390x844 device in a 390x400 container
    // scaleX = 390/390 = 1.0, scaleY = 400/844 ≈ 0.474
    const zoom = computeFitZoom(390, 844, 390, 400);
    expect(zoom).toBeCloseTo(400 / 844, 3);
  });

  it('clamps to minimum zoom (0.25)', () => {
    // Very large device in tiny container
    const zoom = computeFitZoom(2000, 4000, 100, 100);
    expect(zoom).toBe(0.25);
  });

  it('clamps to maximum zoom (2.0)', () => {
    // Tiny device in huge container
    const zoom = computeFitZoom(100, 100, 5000, 5000);
    expect(zoom).toBe(2.0);
  });

  it('returns 1 for zero container dimensions', () => {
    expect(computeFitZoom(390, 844, 0, 500)).toBe(1);
    expect(computeFitZoom(390, 844, 500, 0)).toBe(1);
  });

  it('returns 1 for zero device dimensions', () => {
    expect(computeFitZoom(0, 844, 500, 500)).toBe(1);
    expect(computeFitZoom(390, 0, 500, 500)).toBe(1);
  });

  it('returns 1 for negative dimensions', () => {
    expect(computeFitZoom(-390, 844, 500, 500)).toBe(1);
    expect(computeFitZoom(390, 844, -500, 500)).toBe(1);
  });

  it('handles landscape orientation (wider than tall)', () => {
    // 844x390 device in 600x400 container
    // scaleX = 600/844 ≈ 0.711, scaleY = 400/390 ≈ 1.026
    const zoom = computeFitZoom(844, 390, 600, 400);
    expect(zoom).toBeCloseTo(600 / 844, 3);
  });

  it('returns exact 1.0 when device matches container', () => {
    const zoom = computeFitZoom(390, 844, 390, 844);
    expect(zoom).toBe(1.0);
  });
});
