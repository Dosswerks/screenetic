import type {
  QueuedDevice,
  PerformanceMetrics,
  DetectedIssue,
} from '@shared/types';

// ===== Constants =====

const IDB_DB_NAME = 'screenetic_report_progress';
const IDB_VERSION = 2;
const PROGRESS_STORE = 'progress';
const SCREENSHOT_STORE = 'screenshots';

/** 24-hour retention for partial progress */
export const PROGRESS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Maximum retry attempts per device */
export const MAX_RETRY_COUNT = 3;

// ===== Persisted State Interface =====

export interface PersistedQueueState {
  id: string;
  url: string;
  devices: QueuedDevice[];
  completedResults: CompletedDeviceResult[];
  networkProfile: string;
  cpuProfile: string;
  startedAt: string;
  lastUpdatedAt: string;
  queueIndex: number;
}

export interface CompletedDeviceResult {
  deviceId: string;
  screenshotKey: string;
  metrics: PerformanceMetrics;
  issues: DetectedIssue[];
}

interface StoredScreenshot {
  id: string;
  sessionId: string;
  blob: Blob;
}

// ===== Pure helpers (exported for testing) =====

/**
 * Check whether a persisted state entry has expired (older than 24 hours).
 */
export function isExpired(lastUpdatedAt: string, now: number = Date.now()): boolean {
  const updatedTime = new Date(lastUpdatedAt).getTime();
  if (isNaN(updatedTime)) return true;
  return now - updatedTime > PROGRESS_MAX_AGE_MS;
}

/**
 * Build the IndexedDB key for a report progress entry.
 */
export function buildProgressKey(sessionId: string): string {
  return `screenetic_report_progress_${sessionId}`;
}

/**
 * Build the IndexedDB key for a screenshot blob.
 */
export function buildScreenshotKey(deviceId: string): string {
  return `screenetic_screenshot_${deviceId}`;
}

/**
 * Determine if a device can be retried (failed with retryCount < MAX_RETRY_COUNT).
 */
export function canRetryDevice(device: QueuedDevice): boolean {
  return device.status === 'failed' && device.retryCount < MAX_RETRY_COUNT;
}

/**
 * Serialize a PersistedQueueState for storage (strips non-serializable fields like Blobs from devices).
 * Screenshot blobs are stored separately via saveScreenshotBlob.
 */
export function serializeForStorage(
  sessionId: string,
  url: string,
  devices: QueuedDevice[],
  networkProfile: string,
  cpuProfile: string,
  startedAt: string,
  queueIndex: number,
): PersistedQueueState {
  const completedResults: CompletedDeviceResult[] = devices
    .filter((d) => d.status === 'complete' && d.result !== null)
    .map((d) => ({
      deviceId: d.config.deviceId ?? 'custom',
      screenshotKey: buildScreenshotKey(d.config.deviceId ?? 'custom'),
      metrics: d.result!.metrics,
      issues: d.result!.issues,
    }));

  return {
    id: buildProgressKey(sessionId),
    url,
    devices: devices.map((d) => ({
      config: d.config,
      status: d.status,
      result: null, // Blobs stored separately
      error: d.error,
      retryCount: d.retryCount,
    })),
    completedResults,
    networkProfile,
    cpuProfile,
    startedAt,
    lastUpdatedAt: new Date().toISOString(),
    queueIndex,
  };
}

// ===== IndexedDB operations =====

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_DB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROGRESS_STORE)) {
        db.createObjectStore(PROGRESS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SCREENSHOT_STORE)) {
        db.createObjectStore(SCREENSHOT_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save the full queue state after each device completes.
 */
export async function saveReportProgress(
  sessionId: string,
  url: string,
  devices: QueuedDevice[],
  networkProfile: string = '',
  cpuProfile: string = '',
  startedAt: string = new Date().toISOString(),
  queueIndex: number = 0,
): Promise<void> {
  try {
    const state = serializeForStorage(
      sessionId,
      url,
      devices,
      networkProfile,
      cpuProfile,
      startedAt,
      queueIndex,
    );
    const db = await openDB();
    const tx = db.transaction(PROGRESS_STORE, 'readwrite');
    tx.objectStore(PROGRESS_STORE).put(state);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Best-effort persistence — don't block queue processing
  }
}

/**
 * Load any unfinished report progress less than 24 hours old.
 * Returns the most recent entry, or null if none found.
 */
export async function loadReportProgress(): Promise<PersistedQueueState | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(PROGRESS_STORE, 'readonly');
    const store = tx.objectStore(PROGRESS_STORE);
    const allRequest = store.getAll();

    const entries = await new Promise<PersistedQueueState[]>((resolve, reject) => {
      allRequest.onsuccess = () => resolve(allRequest.result ?? []);
      allRequest.onerror = () => reject(allRequest.error);
    });
    db.close();

    // Filter to non-expired entries
    const valid = entries.filter((e) => !isExpired(e.lastUpdatedAt));
    if (valid.length === 0) return null;

    // Return the most recently updated entry
    valid.sort(
      (a, b) =>
        new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime(),
    );
    return valid[0];
  } catch {
    return null;
  }
}

/**
 * Delete progress data for a specific session.
 */
export async function deleteReportProgress(sessionId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(PROGRESS_STORE, 'readwrite');
    tx.objectStore(PROGRESS_STORE).delete(buildProgressKey(sessionId));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Best-effort cleanup
  }
}

/**
 * Store a screenshot blob separately (keyed by deviceId).
 */
export async function saveScreenshotBlob(
  deviceId: string,
  sessionId: string,
  blob: Blob,
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(SCREENSHOT_STORE, 'readwrite');
    const entry: StoredScreenshot = {
      id: buildScreenshotKey(deviceId),
      sessionId,
      blob,
    };
    tx.objectStore(SCREENSHOT_STORE).put(entry);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Best-effort
  }
}

/**
 * Retrieve a stored screenshot blob.
 */
export async function loadScreenshotBlob(deviceId: string): Promise<Blob | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(SCREENSHOT_STORE, 'readonly');
    const request = tx.objectStore(SCREENSHOT_STORE).get(buildScreenshotKey(deviceId));
    const result = await new Promise<StoredScreenshot | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return result?.blob ?? null;
  } catch {
    return null;
  }
}

/**
 * Delete all screenshot blobs for a given session.
 */
export async function deleteAllScreenshots(sessionId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(SCREENSHOT_STORE, 'readwrite');
    const store = tx.objectStore(SCREENSHOT_STORE);
    const allRequest = store.getAll();
    const entries = await new Promise<StoredScreenshot[]>((resolve, reject) => {
      allRequest.onsuccess = () => resolve(allRequest.result ?? []);
      allRequest.onerror = () => reject(allRequest.error);
    });

    // Delete only screenshots belonging to this session
    const deleteTx = db.transaction(SCREENSHOT_STORE, 'readwrite');
    const deleteStore = deleteTx.objectStore(SCREENSHOT_STORE);
    for (const entry of entries) {
      if (entry.sessionId === sessionId) {
        deleteStore.delete(entry.id);
      }
    }
    await new Promise<void>((resolve, reject) => {
      deleteTx.oncomplete = () => resolve();
      deleteTx.onerror = () => reject(deleteTx.error);
    });
    db.close();
  } catch {
    // Best-effort cleanup
  }
}

/**
 * Delete all progress entries older than 24 hours.
 */
export async function purgeExpiredProgress(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(PROGRESS_STORE, 'readonly');
    const allRequest = tx.objectStore(PROGRESS_STORE).getAll();
    const entries = await new Promise<PersistedQueueState[]>((resolve, reject) => {
      allRequest.onsuccess = () => resolve(allRequest.result ?? []);
      allRequest.onerror = () => reject(allRequest.error);
    });

    const expired = entries.filter((e) => isExpired(e.lastUpdatedAt));
    if (expired.length === 0) {
      db.close();
      return;
    }

    const deleteTx = db.transaction(PROGRESS_STORE, 'readwrite');
    const deleteStore = deleteTx.objectStore(PROGRESS_STORE);
    for (const entry of expired) {
      deleteStore.delete(entry.id);
    }
    await new Promise<void>((resolve, reject) => {
      deleteTx.oncomplete = () => resolve();
      deleteTx.onerror = () => reject(deleteTx.error);
    });
    db.close();
  } catch {
    // Best-effort cleanup
  }
}
