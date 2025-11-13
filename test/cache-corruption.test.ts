import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { loadCache, saveCache, CacheData } from '../src/cache';

describe('Cache corruption recovery', () => {
  const testDir = path.join(process.cwd(), 'tmp-cache-recovery-test');
  const cacheFile = path.join(testDir, 'test-cache.json');

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  it('handles empty cache file', async () => {
    await fs.writeFile(cacheFile, '', 'utf8');
    const cache = await loadCache(cacheFile);
    expect(cache).toEqual({ version: 2, entries: {} });
  });

  it('handles whitespace-only cache file', async () => {
    await fs.writeFile(cacheFile, '   \n\t  \n  ', 'utf8');
    const cache = await loadCache(cacheFile);
    expect(cache).toEqual({ version: 2, entries: {} });
  });

  it('handles malformed JSON', async () => {
    await fs.writeFile(cacheFile, '{invalid json}', 'utf8');
    const cache = await loadCache(cacheFile);
    expect(cache).toEqual({ version: 2, entries: {} });

    // Check that corrupted file was backed up
    const files = await fs.readdir(testDir);
    const backupFile = files.find((f) => f.includes('.corrupted.'));
    expect(backupFile).toBeDefined();
  });

  it('handles missing version field', async () => {
    await fs.writeFile(cacheFile, JSON.stringify({ entries: {} }), 'utf8');
    const cache = await loadCache(cacheFile);
    expect(cache).toEqual({ version: 2, entries: {} });
  });

  it('handles missing entries field', async () => {
    await fs.writeFile(cacheFile, JSON.stringify({ version: 2 }), 'utf8');
    const cache = await loadCache(cacheFile);
    expect(cache).toEqual({ version: 2, entries: {} });
  });

  it('handles invalid entry structure', async () => {
    await fs.writeFile(
      cacheFile,
      JSON.stringify({
        version: 2,
        entries: {
          'file1.txt': { invalid: 'structure' },
        },
      }),
      'utf8',
    );
    const cache = await loadCache(cacheFile);
    expect(cache).toEqual({ version: 2, entries: {} });
  });

  it('upgrades version 1 cache to version 2', async () => {
    const v1Cache = {
      version: 1,
      entries: {
        'file1.txt': {
          mtimeMs: 1234567890,
          size: 100,
          findings: [],
        },
      },
    };
    await fs.writeFile(cacheFile, JSON.stringify(v1Cache), 'utf8');
    const cache = await loadCache(cacheFile);
    expect(cache.version).toBe(2);
    expect(cache.entries).toEqual(v1Cache.entries);
  });

  it('returns empty cache when file does not exist', async () => {
    const cache = await loadCache(path.join(testDir, 'nonexistent.json'));
    expect(cache).toEqual({ version: 2, entries: {} });
  });

  it('saves cache atomically using temp file', async () => {
    const validCache: CacheData = {
      version: 2,
      entries: {
        'test.txt': {
          mtimeMs: Date.now(),
          size: 42,
          findings: [],
        },
      },
    };

    await saveCache(cacheFile, validCache);

    // Verify no temp files remain
    const files = await fs.readdir(testDir);
    const tempFiles = files.filter((f) => f.includes('.tmp.'));
    expect(tempFiles.length).toBe(0);

    // Verify cache was written correctly
    const loaded = await loadCache(cacheFile);
    expect(loaded).toEqual(validCache);
  });

  it('validates cache data before saving', async () => {
    const invalidCache = {
      version: 2,
      entries: 'not an object',
    } as any;

    await expect(saveCache(cacheFile, invalidCache)).rejects.toThrow(
      'Invalid cache data structure',
    );
  });

  it('cleans up temp file on save failure', async () => {
    // Skip on Windows where permission handling is different
    if (process.platform === 'win32') {
      return;
    }

    const validCache: CacheData = {
      version: 2,
      entries: {},
    };

    const readOnlyPath = path.join(testDir, 'readonly', 'cache.json');
    await fs.mkdir(path.dirname(readOnlyPath), { recursive: true });

    try {
      // Make directory read-only
      await fs.chmod(path.dirname(readOnlyPath), 0o444);

      await expect(saveCache(readOnlyPath, validCache)).rejects.toThrow();

      // Check no temp files left behind
      const files = await fs.readdir(path.dirname(readOnlyPath)).catch(() => []);
      const tempFiles = files.filter((f) => f.includes('.tmp.'));
      expect(tempFiles.length).toBe(0);
    } finally {
      // Restore permissions for cleanup
      await fs.chmod(path.dirname(readOnlyPath), 0o755).catch(() => {});
    }
  });

  it('handles concurrent cache corruption scenarios', async () => {
    // Simulate partially written cache (truncated JSON)
    await fs.writeFile(cacheFile, '{"version":2,"entries":{"file1', 'utf8');
    const cache1 = await loadCache(cacheFile);
    expect(cache1).toEqual({ version: 2, entries: {} });

    // Write valid cache
    const validCache: CacheData = {
      version: 2,
      entries: {
        'file2.txt': {
          mtimeMs: Date.now(),
          size: 100,
          findings: [],
        },
      },
    };
    await saveCache(cacheFile, validCache);

    // Load and verify
    const cache2 = await loadCache(cacheFile);
    expect(cache2).toEqual(validCache);
  });

  it('handles large cache files without memory issues', async () => {
    // Create a large cache with many entries
    const largeCache: CacheData = {
      version: 2,
      entries: {},
    };

    for (let i = 0; i < 1000; i++) {
      largeCache.entries[`file${i}.txt`] = {
        mtimeMs: Date.now(),
        size: i * 100,
        findings: [],
      };
    }

    await saveCache(cacheFile, largeCache);
    const loaded = await loadCache(cacheFile);

    expect(loaded.version).toBe(2);
    expect(Object.keys(loaded.entries).length).toBe(1000);
  });
});
