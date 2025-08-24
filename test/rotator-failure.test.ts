import { describe, it, expect } from 'vitest';
const fs = require('fs');

describe('apply rotator failure modes', () => {
  it('fails when backup write fails', async () => {
    const tmp = 'tmp-fail-backup.txt';
    fs.writeFileSync(tmp, 'secret AKIAABCDEFGHIJKLMNOP end');
  // create a file where the tmp dir should be to force backup write failure
  try { fs.unlinkSync('.sentinel_tmp'); } catch {}
  fs.writeFileSync('.sentinel_tmp', 'not a dir');

  const { applyRotator } = await import('../src/rotators/applyRotator');
  const res = await applyRotator.rotate({ filePath: tmp, line: 1, column: 1, match: 'AKIAABCDEFGHIJKLMNOP' } as any);
    const content = fs.readFileSync(tmp, 'utf8');
  fs.unlinkSync(tmp);
  try { fs.rmSync('.sentinel_tmp', { recursive: true, force: true }); } catch {}

  // backup write failed so operation should fail and file stay unchanged
  expect(res.success).toBe(false);
  expect(content).toContain('AKIAABCDEFGHIJKLMNOP');
  });

  it('rolls back when rename fails', async () => {
    const tmp = 'tmp-fail-rename.txt';
    fs.writeFileSync(tmp, 'secret AKIAABCDEFGHIJKLMNOP end');
    const fsPromises = require('fs/promises');
    const originalRename = fsPromises.rename;
    fsPromises.rename = async function (p1: string, p2: string) {
      if (typeof p1 === 'string' && p1.includes('.tmp.')) {
        throw new Error('simulated rename failure');
      }
      return originalRename.apply(this, arguments as any);
    };

    const { applyRotator } = await import('../src/rotators/applyRotator');
    const res = await applyRotator.rotate({ filePath: tmp, line: 1, column: 1, match: 'AKIAABCDEFGHIJKLMNOP' } as any);

    fsPromises.rename = originalRename;
    const content = fs.readFileSync(tmp, 'utf8');
    fs.unlinkSync(tmp);
    try { fs.rmSync('.sentinel_tmp', { recursive: true, force: true }); } catch {}

  // rename is simulated to fail but copy fallback should succeed
  expect(res.success).toBe(true);
  expect(content).not.toContain('AKIAABCDEFGHIJKLMNOP');
  });

  it('handles rollback failure gracefully', async () => {
    const tmp = 'tmp-fail-rollback.txt';
    fs.writeFileSync(tmp, 'secret AKIAABCDEFGHIJKLMNOP end');
    const fsPromises = require('fs/promises');
    const originalWriteFile = fsPromises.writeFile;
    const originalCopyFile = fsPromises.copyFile;
    fsPromises.writeFile = async function (p: string, data: any, enc?: any) {
      if (typeof p === 'string' && p.includes('.tmp.')) {
        throw new Error('simulated tmp write failure');
      }
      return originalWriteFile.apply(this, arguments as any);
    };
    fsPromises.copyFile = async function () {
      throw new Error('simulated copy failure');
    };

    const { applyRotator } = await import('../src/rotators/applyRotator');
    const res = await applyRotator.rotate({ filePath: tmp, line: 1, column: 1, match: 'AKIAABCDEFGHIJKLMNOP' } as any);

    fsPromises.writeFile = originalWriteFile;
    fsPromises.copyFile = originalCopyFile;
    const content = fs.readFileSync(tmp, 'utf8');
    fs.unlinkSync(tmp);
    try { fs.rmSync('.sentinel_tmp', { recursive: true, force: true }); } catch {}

    expect(res.success).toBe(false);
    expect(content).toContain('AKIAABCDEFGHIJKLMNOP');
  });
});
