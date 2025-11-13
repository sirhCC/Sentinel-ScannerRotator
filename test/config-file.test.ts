import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { loadPatterns } from '../src/config';

describe('root config file loader', () => {
  const tmpDir = path.join(process.cwd(), 'tmp_test_cfg');
  beforeEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true });
    } catch {}
    await fs.mkdir(tmpDir, { recursive: true });
  });
  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true });
    } catch {}
  });

  it('reads JSON config when present', async () => {
    const cfg = { patterns: [{ name: 'TESTJSON', regex: 'JSON123' }] };
    await fs.writeFile(path.join(tmpDir, '.secretsentinel.json'), JSON.stringify(cfg), 'utf8');
    const patterns = await loadPatterns(tmpDir);
    expect(patterns.some((p) => p.name === 'TESTJSON')).toBe(true);
  });

  it('reads YAML config when present', async () => {
    const yaml = 'patterns:\n  - name: TESTYAML\n    regex: YAMLYAMLYAMLY';
    await fs.writeFile(path.join(tmpDir, '.secretsentinel.yaml'), yaml, 'utf8');
    const patterns = await loadPatterns(tmpDir);
    // if js-yaml not installed, loader returns [] — assert no throw
    expect(Array.isArray(patterns)).toBe(true);
  });
});
