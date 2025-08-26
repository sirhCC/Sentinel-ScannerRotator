import { describe, it, expect, beforeEach } from 'vitest';
import { scanPath } from '../src/scanner';
import tar from 'tar-stream';
import zlib from 'zlib';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';

describe('tar.gz scanner plugin', () => {
  const tmpDir = path.join(process.cwd(), '.sentinel_tmp', 'targz-test');

  beforeEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.mkdir(tmpDir, { recursive: true });
  });

  it('finds secrets inside tar.gz entries', async () => {
    const pack = tar.pack();
    pack.entry({ name: 'inner.txt' }, 'hello AKIAABCDEFGHIJKLMNOP world');
    pack.finalize();
    const gzip = zlib.createGzip();
    const targzPath = path.join(tmpDir, 'archive.tgz');
    await new Promise<void>((resolve, reject) => {
      const ws = fsSync.createWriteStream(targzPath);
      ws.on('finish', () => resolve());
      ws.on('error', reject);
      pack.pipe(gzip).pipe(ws);
    });

    const results = await scanPath(tmpDir);
    expect(results.length).toBeGreaterThan(0);
    const anyFromTgz = results.find(r => r.filePath.includes('archive.tgz:inner.txt'));
    expect(anyFromTgz).toBeTruthy();
  });
});
