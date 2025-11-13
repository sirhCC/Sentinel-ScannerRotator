import { describe, it, expect, beforeEach } from 'vitest';
import { scanPath } from '../src/scanner';
import fs from 'fs/promises';
import path from 'path';

describe('scan cache', () => {
  const tmpDir = path.join(process.cwd(), '.sentinel_tmp', 'cache-test');
  const cacheFile = path.join(tmpDir, 'cache.json');
  const workDir = path.join(tmpDir, 'work');

  beforeEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.mkdir(workDir, { recursive: true });
  });

  it('reuses findings for unchanged files and updates after change', async () => {
    const f1 = path.join(workDir, 'a.txt');
    await fs.writeFile(f1, 'token=AKIAABCDEFGHIJKLMNOP\nnone');

    const run1 = await scanPath(workDir, undefined, undefined, {
      cachePath: cacheFile,
      concurrency: 2,
    });
    expect(run1.length).toBeGreaterThan(0);

    // second run should use cache and yield same findings
    const run2 = await scanPath(workDir, undefined, undefined, {
      cachePath: cacheFile,
      concurrency: 2,
    });
    expect(run2.length).toEqual(run1.length);

    // modify file to invalidate cache
    await new Promise((r) => setTimeout(r, 5)); // ensure mtime changes on fast filesystems
    await fs.writeFile(f1, 'nothing to see here');
    const run3 = await scanPath(workDir, undefined, undefined, {
      cachePath: cacheFile,
      concurrency: 2,
    });
    expect(run3.length).toEqual(0);
  });
});
