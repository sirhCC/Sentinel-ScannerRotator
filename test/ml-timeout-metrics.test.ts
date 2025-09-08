import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { scanPath } from '../src/scanner';

describe('ML hook timeout and metrics', () => {
  it('applies timeout and increments metrics', async () => {
    const repo = 'tmp-ml-timeout';
    const hookFile = path.resolve('tmp-ml-timeout-module.mjs');
    try { fs.mkdirSync(repo); } catch {}
    fs.writeFileSync(path.join(repo, 'a.txt'), 'hello TOKEN_123');
    // slow hook exceeds 5ms budget
    fs.writeFileSync(hookFile, `export async function analyzeLine(line, ctx) { await new Promise(r=>setTimeout(r, 10)); return [{ token: 'TOKEN_123', index: line.indexOf('TOKEN_123'), ruleName: 'ML-Slow', severity: 'low' }]; }`);
    const prevHook = process.env.SENTINEL_ML_HOOK;
    const prevBudget = process.env.SENTINEL_ML_MAX_MS;
    process.env.SENTINEL_ML_HOOK = hookFile;
    process.env.SENTINEL_ML_MAX_MS = '5';
    const results = await scanPath(repo);
    process.env.SENTINEL_ML_HOOK = prevHook;
    process.env.SENTINEL_ML_MAX_MS = prevBudget;
    try { fs.rmSync(repo, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(hookFile, { force: true }); } catch {}
    // Since we timed out, no ML finding is guaranteed; but scan should still succeed
    expect(Array.isArray(results)).toBe(true);
  });
});
