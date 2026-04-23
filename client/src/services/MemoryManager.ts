import {
  saveScreenshotBlob,
  loadScreenshotBlob,
} from './ReportPersistence';

// ===== Constants =====

const DESKTOP_MAX_BLOBS = 5;
const MOBILE_MAX_BLOBS = 3;

// ===== Mobile detection =====

/**
 * Detect whether the current device is mobile based on user-agent and screen size.
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const mobileUA = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  if (mobileUA) return true;
  if (typeof window !== 'undefined' && window.innerWidth < 768) return true;
  return false;
}

/**
 * Returns the max number of screenshot blobs to keep in memory.
 * 3 on mobile, 5 on desktop.
 */
export function getMaxBlobsInMemory(): number {
  return isMobileDevice() ? MOBILE_MAX_BLOBS : DESKTOP_MAX_BLOBS;
}

// ===== BlobPool =====

/**
 * Manages a pool of in-memory blobs with a configurable max size.
 * When the pool is full, the oldest blob is evicted to IndexedDB.
 */
export class BlobPool {
  private _maxInMemory: number;
  /** In-memory blobs, ordered by insertion (oldest first). */
  private _memoryMap: Map<string, Blob> = new Map();
  /** Keys that have been evicted to IndexedDB. */
  private _evictedKeys: Set<string> = new Set();
  /** Session ID used for IndexedDB storage. */
  private _sessionId: string;

  constructor(maxInMemory: number, sessionId: string = 'default') {
    this._maxInMemory = Math.max(1, maxInMemory);
    this._sessionId = sessionId;
  }

  /** Current number of blobs in memory. */
  get size(): number {
    return this._memoryMap.size;
  }

  /** All keys (memory + IndexedDB). */
  get keys(): string[] {
    return [...new Set([...this._memoryMap.keys(), ...this._evictedKeys])];
  }

  /**
   * Add a blob to the pool. If the pool is full, evicts the oldest to IndexedDB.
   */
  async add(key: string, blob: Blob): Promise<void> {
    // If key already exists in memory, remove it first (will be re-added at end)
    if (this._memoryMap.has(key)) {
      this._memoryMap.delete(key);
    }
    // Remove from evicted set if present
    this._evictedKeys.delete(key);

    // Evict oldest if at capacity
    while (this._memoryMap.size >= this._maxInMemory) {
      const oldestKey = this._memoryMap.keys().next().value as string;
      const oldestBlob = this._memoryMap.get(oldestKey)!;
      this._memoryMap.delete(oldestKey);

      // Serialize to IndexedDB
      await saveScreenshotBlob(oldestKey, this._sessionId, oldestBlob);
      this._evictedKeys.add(oldestKey);
    }

    this._memoryMap.set(key, blob);
  }

  /**
   * Retrieve a blob by key. Checks memory first, then IndexedDB.
   */
  async get(key: string): Promise<Blob | null> {
    const inMemory = this._memoryMap.get(key);
    if (inMemory) return inMemory;

    if (this._evictedKeys.has(key)) {
      const blob = await loadScreenshotBlob(key);
      return blob;
    }

    return null;
  }

  /**
   * Remove a blob from both memory and the evicted set.
   */
  async remove(key: string): Promise<void> {
    this._memoryMap.delete(key);
    this._evictedKeys.delete(key);
  }

  /**
   * Clear all blobs from memory and the evicted set.
   */
  async clear(): Promise<void> {
    this._memoryMap.clear();
    this._evictedKeys.clear();
  }
}

// ===== Object URL tracking =====

const _trackedURLs: Set<string> = new Set();

/**
 * Create an object URL and track it for later revocation.
 */
export function createObjectURLTracked(blob: Blob): string {
  const url = URL.createObjectURL(blob);
  _trackedURLs.add(url);
  return url;
}

/**
 * Revoke a single tracked object URL.
 */
export function revokeObjectURL(url: string): void {
  if (_trackedURLs.has(url)) {
    URL.revokeObjectURL(url);
    _trackedURLs.delete(url);
  }
}

/**
 * Revoke all tracked object URLs.
 */
export function revokeAllObjectURLs(): void {
  for (const url of _trackedURLs) {
    URL.revokeObjectURL(url);
  }
  _trackedURLs.clear();
}

/**
 * Returns the current count of tracked object URLs (for testing).
 */
export function getTrackedURLCount(): number {
  return _trackedURLs.size;
}

// ===== beforeunload cleanup =====

/**
 * Register a cleanup function to run on beforeunload.
 * Returns an unregister function.
 */
export function registerBeforeUnloadCleanup(cleanup: () => void): () => void {
  const handler = () => {
    cleanup();
  };
  window.addEventListener('beforeunload', handler);
  return () => {
    window.removeEventListener('beforeunload', handler);
  };
}
