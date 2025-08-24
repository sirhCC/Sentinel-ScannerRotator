import { describe, it, expect } from 'vitest';
import { applyRotator } from '../src/rotators/applyRotator';
import fs from 'fs';

describe('apply rotator safeUpdate', () => {
  it('replaces content and creates backup', async () => {
    const tmp = 'tmp-apply.txt';
    fs.writeFileSync(tmp, 'secret AKIAABCDEFGHIJKLMNOP end');
    const findings = [{ filePath: tmp, line: 1, column: 8, match: 'AKIAABCDEFGHIJKLMNOP' }];
    const res = await applyRotator.rotate(findings[0] as any);
    const content = fs.readFileSync(tmp, 'utf8');
    // cleanup
    const backupPathMatch = /backup: (.+)\)/.exec(res.message || '');
    if (backupPathMatch) {
      const bak = backupPathMatch[1];
      try {
        fs.unlinkSync(bak);
      } catch (_) {}
    }
    fs.unlinkSync(tmp);
    try {
      fs.rmSync('.sentinel_tmp', { recursive: true, force: true });
    } catch (_) {}
    expect(res.success).toBe(true);
    expect(content).toContain('__REPLACED_SECRET_');
  });

  it('rolls back on simulated failure', async () => {
    const tmp = 'tmp-apply-fail.txt';
    fs.writeFileSync(tmp, 'secret AKIAABCDEFGHIJKLMNOP end');
    // monkey-patch fs.writeFile to throw when writing tmp file to simulate failure
    const fsPromises = require('fs/promises');
    const originalWriteFile = fsPromises.writeFile;
    fsPromises.writeFile = async function (p: string, data: any, enc?: any) {
      if (typeof p === 'string' && p.includes('.tmp.')) {
        throw new Error('simulated write failure');
      }
      return originalWriteFile.apply(this, arguments as any);
    };

    const findings = [{ filePath: tmp, line: 1, column: 8, match: 'AKIAABCDEFGHIJKLMNOP' }];
    const res = await applyRotator.rotate(findings[0] as any);

    // restore
    fsPromises.writeFile = originalWriteFile;

    const content = fs.readFileSync(tmp, 'utf8');
    fs.unlinkSync(tmp);
    expect(res.success).toBe(false);
    // content should remain original
    expect(content).toContain('AKIAABCDEFGHIJKLMNOP');
  });
});
