import fs from 'fs/promises';
import path from 'path';
import { Finding } from './types.js';
import { safeJsonParse } from './errorHandling.js';

export type CacheEntry = {
  mtimeMs: number;
  size: number;
  findings: Finding[];
  hash?: string;
};

export type CacheData = {
  version: number; // 1 = mtime/size only, 2 = optional hash
  entries: Record<string, CacheEntry>;
};

/**
 * Validates cache data structure
 */
function validateCacheData(data: any): data is CacheData {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.version !== 'number') return false;
  if (data.version !== 1 && data.version !== 2) return false;
  if (!data.entries || typeof data.entries !== 'object') return false;

  // Validate a sample of entries (first 10) to avoid performance hit
  const entryKeys = Object.keys(data.entries).slice(0, 10);
  for (const key of entryKeys) {
    const entry = data.entries[key];
    if (!entry || typeof entry !== 'object') return false;
    if (typeof entry.mtimeMs !== 'number') return false;
    if (typeof entry.size !== 'number') return false;
    if (!Array.isArray(entry.findings)) return false;
  }

  return true;
}

/**
 * Creates a backup of corrupted cache file for forensics
 */
async function backupCorruptedCache(filePath: string): Promise<void> {
  try {
    const timestamp = Date.now();
    const backupPath = `${filePath}.corrupted.${timestamp}`;
    await fs.copyFile(filePath, backupPath);
    console.warn(`Cache corrupted - backed up to: ${backupPath}`);
  } catch {
    // Backup failed, but don't block recovery
  }
}

export async function loadCache(filePath: string): Promise<CacheData> {
  const defaultCache: CacheData = { version: 2, entries: {} };

  try {
    const txt = await fs.readFile(filePath, 'utf8');

    // Check for empty or whitespace-only file
    if (!txt || txt.trim().length === 0) {
      console.warn('Cache file is empty - initializing new cache');
      return defaultCache;
    }

    // Safe JSON parse with validation
    const parsed = safeJsonParse<CacheData | { version: 1; entries: Record<string, CacheEntry> } | null>(
      txt,
      null,
      validateCacheData,
    );

    if (parsed === null) {
      // JSON parse failed or validation failed
      await backupCorruptedCache(filePath);
      console.warn('Cache file corrupted - starting fresh');
      // Attempt to delete corrupted cache
      try {
        await fs.unlink(filePath);
      } catch {}
      return defaultCache;
    }

    // Upgrade version 1 to version 2 if needed
    if (parsed.version === 1) {
      console.info('Upgrading cache from version 1 to version 2');
      return { version: 2, entries: parsed.entries };
    }

    return parsed;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    // File not found is expected for first run
    if ((error as any).code === 'ENOENT') {
      return defaultCache;
    }

    // Permission denied
    if ((error as any).code === 'EACCES') {
      console.error(`Cannot read cache file (permission denied): ${filePath}`);
      return defaultCache;
    }

    // Other errors - log and return empty cache
    console.error(`Error loading cache: ${err.message}`);
    return defaultCache;
  }
}

export async function saveCache(filePath: string, data: CacheData): Promise<void> {
  const dir = path.dirname(filePath);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    throw new Error(`Failed to create cache directory: ${err.message}`);
  }

  // Validate data before writing
  if (!validateCacheData(data)) {
    throw new Error('Invalid cache data structure - refusing to write corrupted cache');
  }

  const toWrite: CacheData = { version: 2, entries: data.entries };
  const jsonString = JSON.stringify(toWrite, null, 2);

  // Write to temp file first, then rename (atomic-ish operation)
  const tempPath = `${filePath}.tmp.${Date.now()}`;
  try {
    await fs.writeFile(tempPath, jsonString, 'utf8');
    // Atomic rename
    await fs.rename(tempPath, filePath);
  } catch (error) {
    // Clean up temp file on error
    try {
      await fs.unlink(tempPath);
    } catch {}

    const err = error instanceof Error ? error : new Error(String(error));
    if ((error as any).code === 'EACCES') {
      throw new Error(`Cannot write cache file (permission denied): ${filePath}`);
    }
    throw new Error(`Failed to save cache: ${err.message}`);
  }
}
