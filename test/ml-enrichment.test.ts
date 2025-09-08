import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { scanPath } from '../src/scanner';

// Validates that ML tokens with only confidence/tags/span are normalized and propagated

describe('ML enrichment', () => {
  it('maps confidence to severity and carries tags/message', async () => {
    const repo = 'tmp-ml-enrich';
    const hookFile = path.resolve('tmp-ml-enrich-module.mjs');
    try { fs.mkdirSync(repo); } catch {}
    fs.writeFileSync(path.join(repo, 'a.txt'), 'abc DEF ghi');
    // Hook returns token with confidence but no severity, and with tags/message/span
    fs.writeFileSync(
      hookFile,
      `export function analyzeLine(line, ctx) { if (line.includes('DEF')) return [{ token: 'DEF', index: line.indexOf('DEF'), confidence: 0.85, tags: ['ml','keyword'], message: 'Detected DEF', span: { start: line.indexOf('DEF'), length: 3 } }]; }`
    );

    const prev = process.env.SENTINEL_ML_HOOK;
    process.env.SENTINEL_ML_HOOK = hookFile;
    const results = await scanPath(repo);
    process.env.SENTINEL_ML_HOOK = prev;
    try { fs.rmSync(repo, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(hookFile, { force: true }); } catch {}

    const ml = results.find((r) => r.ruleName === 'ML-Hook' && r.match === 'DEF');
    expect(ml).toBeTruthy();
    expect(ml?.severity).toBe('high'); // 0.85 -> high via mapping
    expect(ml?.confidence).toBeCloseTo(0.85, 5);
    expect(ml?.tags).toContain('ml');
    expect(ml?.message).toBe('Detected DEF');
    expect(ml?.column).toBe(1 + 'abc '.length); // span.start respected
  });
});
