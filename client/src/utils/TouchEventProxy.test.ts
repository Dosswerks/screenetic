import { describe, it, expect } from 'vitest';
import { translateCoords } from './TouchEventProxy';

describe('translateCoords', () => {
  it('translates mouse coordinates to iframe CSS pixel space at 1x zoom', () => {
    const iframeRect = { left: 100, top: 50 } as DOMRect;
    const result = translateCoords(200, 150, iframeRect, 1);
    expect(result).toEqual({ x: 100, y: 100 });
  });

  it('scales coordinates by zoom factor', () => {
    const iframeRect = { left: 0, top: 0 } as DOMRect;
    const result = translateCoords(200, 100, iframeRect, 2);
    expect(result).toEqual({ x: 100, y: 50 });
  });

  it('accounts for both offset and zoom', () => {
    const iframeRect = { left: 50, top: 50 } as DOMRect;
    const result = translateCoords(150, 150, iframeRect, 0.5);
    // (150 - 50) / 0.5 = 200, (150 - 50) / 0.5 = 200
    expect(result).toEqual({ x: 200, y: 200 });
  });

  it('handles fractional zoom values', () => {
    const iframeRect = { left: 10, top: 20 } as DOMRect;
    const result = translateCoords(110, 120, iframeRect, 0.75);
    expect(result.x).toBeCloseTo(133.33, 1);
    expect(result.y).toBeCloseTo(133.33, 1);
  });

  it('returns 0,0 when mouse is at iframe origin with 1x zoom', () => {
    const iframeRect = { left: 300, top: 200 } as DOMRect;
    const result = translateCoords(300, 200, iframeRect, 1);
    expect(result).toEqual({ x: 0, y: 0 });
  });
});
