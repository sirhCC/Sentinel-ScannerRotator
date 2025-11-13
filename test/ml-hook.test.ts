import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { scanPath } from '../src/scanner';

describe('ML hook integration', () => {
  it('invokes analyzeLine and yields extra findings', async () => {
    const repo = 'tmp-ml-hook';
    const hookFile = path.resolve('tmp-ml-hook-module.mjs');
    try {
      fs.mkdirSync(repo);
    } catch {}
    fs.writeFileSync(path.join(repo, 'a.txt'), 'line with TOKEN_XYZ_12345');
    fs.writeFileSync(
      hookFile,
      `export function analyzeLine(line, ctx) { if (line.includes('TOKEN_XYZ')) return [{ token: 'TOKEN_XYZ_12345', index: line.indexOf('TOKEN_XYZ_12345'), ruleName: 'ML-Test', severity: 'low' }]; }`,
    );

    const prev = process.env.SENTINEL_ML_HOOK;
    process.env.SENTINEL_ML_HOOK = hookFile;
    const results = await scanPath(repo);
    process.env.SENTINEL_ML_HOOK = prev;
    try {
      fs.rmSync(repo, { recursive: true, force: true });
    } catch {}
    try {
      fs.rmSync(hookFile, { force: true });
    } catch {}
    expect(results.find((r) => r.ruleName === 'ML-Test')).toBeTruthy();
  });
});
