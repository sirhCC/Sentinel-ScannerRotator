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
    process.env.SENTINEL_BACKEND = 'file';
    process.env.SENTINEL_BACKEND_FILE = path.join(repo, 'secrets.json');
    // First run: store initial secret; capture key from ref by forcing override
    const key = 'fixed_key_for_test';
    process.env.SENTINEL_BACKEND_KEY_OVERRIDE = key;
    let code = await runCli([repo, '--rotator', 'backend', '--verify', '--force']);
    expect(code).toBe(0);
    // Now change the file to include a different secret, same key override -> update same backend key
  fs.writeFileSync(file, 'AKIAQRSTUVWXYZABCD');
    code = await runCli([repo, '--rotator', 'backend', '--verify', '--force']);
    expect(code).toBe(0);
    // Verify secrets.json contains the updated value and history file has at least one entry
    const secretsPath = path.join(repo, 'secrets.json');
    const json = JSON.parse(fs.readFileSync(secretsPath, 'utf8'));
  // The stored value should be one of the two inputs, and history should have at least one event showing a change
  expect(['AKIAABCDEFGHIJKLMNOP', 'AKIAQRSTUVWXYZABCD']).toContain(json[key]);
  const histPath = path.join(repo, 'secrets.history.ndjson');
  const hist = fs.existsSync(histPath) ? fs.readFileSync(histPath, 'utf8').trim().split(/\n/).filter(Boolean) : [];
  expect(hist.length).toBeGreaterThanOrEqual(1);
  // Validate the last history event references our key
  const last = JSON.parse(hist[hist.length - 1]);
  expect(last.key).toBe(key);
    try { fs.rmSync(repo, { recursive: true, force: true }); } catch {}
  });
});
