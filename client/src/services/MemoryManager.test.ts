import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isMobileDevice,
  getMaxBlobsInMemory,
  BlobPool,
  createObjectURLTracked,
  revokeObjectURL,
  revokeAllObjectURLs,
  getTrackedURLCount,
  registerBeforeUnloadCleanup,
} from './MemoryManager';

// ===== Mock ReportPersistence for BlobPool eviction tests =====

const savedBlobs = new Map<string, Blob>();

vi.mock('./ReportPersistence', () => ({
  saveScreenshotBlob: vi.fn(async (deviceId: string, _sessionId: string, blob: Blob) => {
    savedBlobs.set(deviceId, blob);
  }),
  loadScreenshotBlob: vi.fn(async (deviceId: string) => {
    return savedBlobs.get(deviceId) ?? null;
  }),
}));

// ===== Helpers =====

function makeBlob(content: string): Blob {
  return new Blob([content], { type: 'image/png' });
}

// ===== Tests =====

describe('isMobileDevice', () => {
  const originalUA = navigator.userAgent;
  const originalInnerWidth = window.innerWidth;

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUA,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'innerWidth', {
      value: originalInnerWidth,
      writable: true,
      configurable: true,
    });
  });

  it('returns true for Android user agent', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36',
      writable: true,
      configurable: true,
    });
    expect(isMobileDevice()).toBe(true);
  });

  it('returns true for iPhone user agent', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      writable: true,
      configurable: true,
    });
    expect(isMobileDevice()).toBe(true);
  });

  it('returns true for narrow viewport on desktop UA', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'innerWidth', {
      value: 375,
      writable: true,
      configurable: true,
    });
    expect(isMobileDevice()).toBe(true);
  });

  it('returns false for desktop UA with wide viewport', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'innerWidth', {
      value: 1440,
      writable: true,
      configurable: true,
    });
    expect(isMobileDevice()).toBe(false);
  });
});

describe('getMaxBlobsInMemory', () => {
  const originalUA = navigator.userAgent;
  const originalInnerWidth = window.innerWidth;

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUA,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'innerWidth', {
      value: originalInnerWidth,
      writable: true,
      configurable: true,
    });
  });

  it('returns 3 on mobile', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      writable: true,
      configurable: true,
    });
    expect(getMaxBlobsInMemory()).toBe(3);
  });

  it('returns 5 on desktop', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'innerWidth', {
      value: 1440,
      writable: true,
      configurable: true,
    });
    expect(getMaxBlobsInMemory()).toBe(5);
  });
});

describe('BlobPool', () => {
  beforeEach(() => {
    savedBlobs.clear();
  });

  it('starts empty', () => {
    const pool = new BlobPool(3);
    expect(pool.size).toBe(0);
    expect(pool.keys).toEqual([]);
  });

  it('adds blobs up to max without eviction', async () => {
    const pool = new BlobPool(3);
    await pool.add('a', makeBlob('a'));
    await pool.add('b', makeBlob('b'));
    await pool.add('c', makeBlob('c'));
    expect(pool.size).toBe(3);
    expect(pool.keys.sort()).toEqual(['a', 'b', 'c']);
  });

  it('evicts oldest blob to IndexedDB when full', async () => {
    const pool = new BlobPool(2);
    await pool.add('a', makeBlob('a'));
    await pool.add('b', makeBlob('b'));
    // Pool is full, adding 'c' should evict 'a'
    await pool.add('c', makeBlob('c'));

    expect(pool.size).toBe(2);
    // 'a' should be evicted to IndexedDB
    expect(savedBlobs.has('a')).toBe(true);
    // All keys should still be accessible
    expect(pool.keys.sort()).toEqual(['a', 'b', 'c']);
  });

  it('retrieves blob from memory', async () => {
    const pool = new BlobPool(3);
    const blob = makeBlob('hello');
    await pool.add('x', blob);
    const result = await pool.get('x');
    expect(result).toBe(blob);
  });

  it('retrieves evicted blob from IndexedDB', async () => {
    const pool = new BlobPool(1);
    const blobA = makeBlob('a-data');
    const blobB = makeBlob('b-data');
    await pool.add('a', blobA);
    await pool.add('b', blobB);

    // 'a' was evicted
    expect(pool.size).toBe(1);
    const result = await pool.get('a');
    expect(result).toBe(blobA); // mock returns the same blob
  });

  it('returns null for unknown key', async () => {
    const pool = new BlobPool(3);
    const result = await pool.get('nonexistent');
    expect(result).toBeNull();
  });

  it('removes blob from memory', async () => {
    const pool = new BlobPool(3);
    await pool.add('a', makeBlob('a'));
    await pool.remove('a');
    expect(pool.size).toBe(0);
    expect(pool.keys).toEqual([]);
  });

  it('clears all blobs', async () => {
    const pool = new BlobPool(2);
    await pool.add('a', makeBlob('a'));
    await pool.add('b', makeBlob('b'));
    await pool.add('c', makeBlob('c')); // evicts 'a'
    await pool.clear();
    expect(pool.size).toBe(0);
    expect(pool.keys).toEqual([]);
  });

  it('re-adding existing key moves it to end (no duplicate)', async () => {
    const pool = new BlobPool(2);
    await pool.add('a', makeBlob('a1'));
    await pool.add('b', makeBlob('b1'));
    // Re-add 'a' — should move to end, 'b' is now oldest
    await pool.add('a', makeBlob('a2'));
    expect(pool.size).toBe(2);

    // Adding 'c' should evict 'b' (oldest), not 'a'
    await pool.add('c', makeBlob('c1'));
    expect(pool.size).toBe(2);
    expect(savedBlobs.has('b')).toBe(true);
  });

  it('enforces minimum maxInMemory of 1', async () => {
    const pool = new BlobPool(0); // should clamp to 1
    await pool.add('a', makeBlob('a'));
    expect(pool.size).toBe(1);
    await pool.add('b', makeBlob('b'));
    expect(pool.size).toBe(1);
    expect(savedBlobs.has('a')).toBe(true);
  });
});

describe('Object URL tracking', () => {
  beforeEach(() => {
    revokeAllObjectURLs();
  });

  it('tracks created object URLs', () => {
    const blob = makeBlob('test');
    const url = createObjectURLTracked(blob);
    expect(url).toBeTruthy();
    expect(getTrackedURLCount()).toBe(1);
  });

  it('revokes a single URL', () => {
    const blob = makeBlob('test');
    const url = createObjectURLTracked(blob);
    revokeObjectURL(url);
    expect(getTrackedURLCount()).toBe(0);
  });

  it('revokes all URLs', () => {
    createObjectURLTracked(makeBlob('a'));
    createObjectURLTracked(makeBlob('b'));
    createObjectURLTracked(makeBlob('c'));
    expect(getTrackedURLCount()).toBe(3);
    revokeAllObjectURLs();
    expect(getTrackedURLCount()).toBe(0);
  });

  it('ignores revoking an untracked URL', () => {
    createObjectURLTracked(makeBlob('a'));
    revokeObjectURL('blob:fake-url');
    expect(getTrackedURLCount()).toBe(1);
  });
});

describe('registerBeforeUnloadCleanup', () => {
  it('calls cleanup on beforeunload', () => {
    const cleanup = vi.fn();
    registerBeforeUnloadCleanup(cleanup);
    window.dispatchEvent(new Event('beforeunload'));
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('returns an unregister function that stops the handler', () => {
    const cleanup = vi.fn();
    const unregister = registerBeforeUnloadCleanup(cleanup);
    unregister();
    window.dispatchEvent(new Event('beforeunload'));
    expect(cleanup).not.toHaveBeenCalled();
  });
});
