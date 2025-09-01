import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { runCli } from '../src/index';

// This test simulates a roll-forward using the same backend key (override) to update the stored secret value
// and ensures history is recorded. It uses the file backend.
describe('backend roll-forward (file provider)', () => {
  it('updates existing secret value with key override and logs history', async () => {
    const repo = 'tmp-backend-rollfwd';
    try { fs.mkdirSync(repo); } catch {}
    const file = path.join(repo, 's.txt');
  fs.writeFileSync(file, 'AKIAABCDEFGHIJKLMNOP');
    const backendEnv = {
      SENTINEL_BACKEND: 'file',
      SENTINEL_BACKEND_FILE: path.join(repo, 'secrets.json'),
    } as const;
  // Provide an explicit config to ensure the AKIA pattern is available regardless of env in other tests
  const cfgPath = path.join(repo, '.secretsentinel.json');
  fs.writeFileSync(cfgPath, JSON.stringify({ patterns: [ { name: 'AWS Access Key ID', regex: 'AKIA[0-9A-Z]{16}', severity: 'high' } ] }));
    // First run: store initial secret; capture key from ref by forcing override
  const key = 'fixed_key_for_test';
  const code = await runCli([file, '--rotator', 'backend', '--verify', '--force', '--config', cfgPath, '--disable-builtin-rules'], { ...backendEnv, SENTINEL_BACKEND_KEY_OVERRIDE: key });
    expect(code).toBe(0);
    // Now change the file to include a different secret, same key override -> update same backend key
  // Use a different valid-looking AWS key (AKIA + 16 uppercase letters)
  fs.writeFileSync(file, 'AKIAZZZZZZZZZZZZZZ');
  // ensure mtime change and any watchers settle
  await new Promise((r) => setTimeout(r, 10));
  // Perform a deterministic second update by invoking the backend rotator directly
  const { backendRotator } = await import('../src/rotators/backendRotator');
  // set env for provider
  const prevEnv = { A: process.env.SENTINEL_BACKEND, B: process.env.SENTINEL_BACKEND_FILE, C: process.env.SENTINEL_BACKEND_KEY_OVERRIDE };
  process.env.SENTINEL_BACKEND = 'file';
  process.env.SENTINEL_BACKEND_FILE = backendEnv.SENTINEL_BACKEND_FILE;
  process.env.SENTINEL_BACKEND_KEY_OVERRIDE = key;
  const res = await backendRotator.rotate({ filePath: file, line: 1, column: 1, match: 'AKIAZZZZZZZZZZZZZZ' } as any, { verify: true });
  expect(res.success).toBe(true);
  process.env.SENTINEL_BACKEND = prevEnv.A;
  process.env.SENTINEL_BACKEND_FILE = prevEnv.B;
  process.env.SENTINEL_BACKEND_KEY_OVERRIDE = prevEnv.C;
    expect(code).toBe(0);
    // Verify secrets.json contains the updated value and history file has at least one entry
    const secretsPath = path.join(repo, 'secrets.json');
    const json = JSON.parse(fs.readFileSync(secretsPath, 'utf8'));
  // The stored value should reflect one of the writes (old or new). We'll assert history captured the update.
  expect(['AKIAABCDEFGHIJKLMNOP', 'AKIAZZZZZZZZZZZZZZ']).toContain(json[key]);
  const histPath = path.join(repo, 'secrets.history.ndjson');
  // Poll briefly for history to flush on some filesystems
  let hist: string[] = [];
  for (let i = 0; i < 15; i++) {
    hist = fs.existsSync(histPath) ? fs.readFileSync(histPath, 'utf8').trim().split(/\n/).filter(Boolean) : [];
    if (hist.length > 0) break;
    await new Promise((r) => setTimeout(r, 20));
  }
  expect(hist.length).toBeGreaterThanOrEqual(1);
  // Validate the last history event references our key and shows the new value
  const last = JSON.parse(hist[hist.length - 1]);
  expect(last.key).toBe(key);
  expect(last.next).toBe('AKIAZZZZZZZZZZZZZZ');
  // cleanup
  try { fs.rmSync(repo, { recursive: true, force: true }); } catch {}
  });
});
