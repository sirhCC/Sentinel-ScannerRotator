import { describe, it, expect } from 'vitest';
import { applyRotator } from '../src/rotators/applyRotator';
import fs from 'fs';

describe('apply rotator safeUpdate', () => {
  it('replaces content and creates backup', async () => {
    const tmp = 'tmp-apply.txt';
  // ensure no stale tmp dir/file from other tests and prepare writable tmp dir
  try { fs.rmSync('.sentinel_tmp', { recursive: true, force: true }); } catch (_) {}
  try { fs.mkdirSync('.sentinel_tmp', { recursive: true }); } catch (_) {}
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
  try { fs.rmSync('.sentinel_tmp', { recursive: true, force: true }); } catch (_) {}
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

  it('supports template-based replacement tokens', async () => {
    const tmp = 'tmp-apply-template.txt';
    const secret = 'AKIAABCDEFGHIJKLMNOP';
    const fileContent = `before ${secret} after`;
    const fs = require('fs');
    fs.writeFileSync(tmp, fileContent);
    const finding = { filePath: tmp, line: 1, column: 8, match: secret } as any;
    const { applyRotator } = await import('../src/rotators/applyRotator');
    const res = await applyRotator.rotate(finding, { template: '__MASKED_{{timestamp}}__' });
    const content = fs.readFileSync(tmp, 'utf8');
    // cleanup
    try { fs.unlinkSync(tmp); } catch {}
    try { fs.rmSync('.sentinel_tmp', { recursive: true, force: true }); } catch {}
    expect(res.success).toBe(true);
    expect(content).toMatch(/__MASKED_\d+__/);
  });
});
