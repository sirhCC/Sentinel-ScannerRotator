import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { runCli } from '../src/index';

describe('e2e backend rotator (file provider)', () => {
  it('stores secret and replaces with secretref, with verify', async () => {
    const repo = `tmp-e2e-backend-${Date.now()}`;
    const file = path.join(repo, 's.txt');
    const uniqueTmp = `.sentinel_tmp_${Date.now()}_${Math.random()}`;
    const secretsPath = path.join(process.cwd(), `.sentinel_secrets_e2e_${Date.now()}.json`);
    try {
      fs.mkdirSync(repo);
    } catch {}
    fs.writeFileSync(file, 'before AKIAABCDEFGHIJKLMNOP after');

    process.env.SENTINEL_TMP_DIR = uniqueTmp;
    process.env.SENTINEL_BACKEND = 'file';
    process.env.SENTINEL_BACKEND_FILE = secretsPath;

    const code = await runCli([repo, '--rotator', 'backend', '--force', '--verify']);
    expect(code).toBe(0);
    const content = fs.readFileSync(file, 'utf8');
    expect(content).toMatch(/secretref:\/\/file\//);
    const map = JSON.parse(fs.readFileSync(secretsPath, 'utf8')) as Record<string, string>;
    const values = Object.values(map);
    expect(values).toContain('AKIAABCDEFGHIJKLMNOP');

    // cleanup
    try {
      fs.rmSync(uniqueTmp, { recursive: true, force: true });
    } catch {}
    try {
      fs.unlinkSync(secretsPath);
    } catch {}
    try {
      fs.rmSync(repo, { recursive: true, force: true });
    } catch {}
    delete process.env.SENTINEL_TMP_DIR;
    delete process.env.SENTINEL_BACKEND;
    delete process.env.SENTINEL_BACKEND_FILE;
  });
});
