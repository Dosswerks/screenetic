import { describe, it, expect, beforeEach } from 'vitest';
import { getCacheMode, setCacheMode } from './CacheManager';

// ===== Pure logic tests for CacheManager =====

describe('CacheManager — cache mode', () => {
  beforeEach(() => {
    // Reset to default
    setCacheMode('cold');
  });

  it('defaults to cold cache mode', () => {
    expect(getCacheMode()).toBe('cold');
  });

  it('can be set to warm', () => {
    setCacheMode('warm');
    expect(getCacheMode()).toBe('warm');
  });

  it('can be toggled back to cold', () => {
    setCacheMode('warm');
    setCacheMode('cold');
    expect(getCacheMode()).toBe('cold');
  });

  it('returns the last set value', () => {
    setCacheMode('warm');
    setCacheMode('warm');
    expect(getCacheMode()).toBe('warm');
    setCacheMode('cold');
    expect(getCacheMode()).toBe('cold');
  });
});
