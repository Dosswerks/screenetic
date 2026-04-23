/**
 * S3 Storage Service — Upload/download/delete screenshot blobs.
 * Stub implementation for development; uses local filesystem.
 * Production uses S3 with AES-256 encryption at rest.
 */
import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = resolve(__dirname, '../../storage');

// Ensure storage directory exists
if (!existsSync(STORAGE_DIR)) mkdirSync(STORAGE_DIR, { recursive: true });

export async function uploadBlob(key: string, data: Buffer, contentType: string): Promise<string> {
  // TODO: Replace with S3 PutObject in production
  const filePath = resolve(STORAGE_DIR, key.replace(/\//g, '_'));
  writeFileSync(filePath, data);
  return key;
}

export async function downloadBlob(key: string): Promise<Buffer | null> {
  const filePath = resolve(STORAGE_DIR, key.replace(/\//g, '_'));
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath);
}

export async function deleteBlob(key: string): Promise<void> {
  const filePath = resolve(STORAGE_DIR, key.replace(/\//g, '_'));
  if (existsSync(filePath)) unlinkSync(filePath);
}

export async function deleteBlobsByPrefix(prefix: string): Promise<void> {
  // TODO: S3 ListObjects + DeleteObjects by prefix
  // For local dev, this is a no-op
  console.log(`[STORAGE] Would delete blobs with prefix: ${prefix}`);
}
