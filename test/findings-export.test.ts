import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { runCli } from '../src/index';

describe('findings export', () => {
  it('writes findings to JSON', async () => {
    const repo = 'tmp-export-json';
    const out = path.join(repo, 'out.json');
    try {
      fs.mkdirSync(repo);
    } catch {}
    fs.writeFileSync(path.join(repo, 'a.txt'), 'AKIAABCDEFGHIJKLMNOP');
    const code = await runCli([repo, '--rotator', 'dry-run', '--out', out]);
    expect(code).toBe(0);
    const arr = JSON.parse(fs.readFileSync(out, 'utf8')) as any[];
    expect(Array.isArray(arr)).toBe(true);
    expect(arr.length).toBeGreaterThan(0);
    expect(arr[0]).toHaveProperty('file');
    try {
      fs.rmSync(repo, { recursive: true, force: true });
    } catch {}
  });

  it('writes findings to CSV', async () => {
    const repo = 'tmp-export-csv';
    const out = path.join(repo, 'out.csv');
    try {
      fs.mkdirSync(repo);
    } catch {}
    fs.writeFileSync(path.join(repo, 'a.txt'), 'AKIAABCDEFGHIJKLMNOP');
    const code = await runCli([repo, '--rotator', 'dry-run', '--out', out, '--out-format', 'csv']);
    expect(code).toBe(0);
    const csv = fs.readFileSync(out, 'utf8');
    expect(csv.split(/\r?\n/)[0]).toBe('file,line,column,match');
    expect(csv).toMatch(/a.txt/);
    try {
      fs.rmSync(repo, { recursive: true, force: true });
    } catch {}
  });
});
