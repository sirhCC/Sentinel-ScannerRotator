import { describe, it, expect, beforeEach } from 'vitest';
import { scanPath } from '../src/scanner';
import JSZip from 'jszip';
import fs from 'fs/promises';
import path from 'path';

describe('zip scanner plugin', () => {
  const tmpDir = path.join(process.cwd(), '.sentinel_tmp', 'zip-test');

  beforeEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.mkdir(tmpDir, { recursive: true });
  });

  it('finds secrets inside zip entries', async () => {
    const zip = new JSZip();
    zip.file('inner.txt', 'hello AKIAABCDEFGHIJKLMNOP world');
    const content = await zip.generateAsync({ type: 'nodebuffer' });
    const zipPath = path.join(tmpDir, 'archive.zip');
    await fs.writeFile(zipPath, content);

    const results = await scanPath(tmpDir);
    expect(results.length).toBeGreaterThan(0);
    const anyFromZip = results.find(r => r.filePath.includes('archive.zip:inner.txt'));
    expect(anyFromZip).toBeTruthy();
  });
});
