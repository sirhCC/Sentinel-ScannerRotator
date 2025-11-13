import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { scanPath } from '../src/scanner';

describe('ML file-level hook', () => {
  it('invokes analyzeFile when mode=file and returns findings', async () => {
    const repo = 'tmp-ml-file-hook';
    const hookFile = path.resolve('tmp-ml-file-module.mjs');
    try {
      fs.mkdirSync(repo);
    } catch {}
    fs.writeFileSync(
      path.join(repo, 'a.txt'),
      '---- BEGIN PRIVATE KEY ----\nabc\n---- END PRIVATE KEY ----',
    );
    fs.writeFileSync(
      hookFile,
      "export function analyzeFile(lines, ctx){ const content = lines.join('\\n'); if(content.includes('BEGIN PRIVATE KEY') && content.includes('END PRIVATE KEY')) return [{ token: 'PRIVATE_KEY_BLOCK', index: 0, ruleName: 'ML-File', severity: 'high' }]; }",
    );
    const prevHook = process.env.SENTINEL_ML_HOOK;
    const prevMode = process.env.SENTINEL_ML_MODE;
    process.env.SENTINEL_ML_HOOK = hookFile;
    process.env.SENTINEL_ML_MODE = 'file';
    const results = await scanPath(repo);
    process.env.SENTINEL_ML_HOOK = prevHook;
    process.env.SENTINEL_ML_MODE = prevMode;
    try {
      fs.rmSync(repo, { recursive: true, force: true });
    } catch {}
    try {
      fs.rmSync(hookFile, { force: true });
    } catch {}
    expect(results.find((r) => r.ruleName === 'ML-File')).toBeTruthy();
  });
});
