import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { runCli } from '../src/index';

describe('e2e harness', () => {
  it('runs dry-run then apply and verifies backup and replacement', async () => {
    const uniqueTmp = `.sentinel_tmp_${Date.now()}_${Math.random()}`;
    process.env.SENTINEL_TMP_DIR = uniqueTmp;
    const repo = 'tmp-e2e-repo';
    const file = path.join(repo, 'secrets.txt');
    try {
      fs.mkdirSync(repo);
    } catch (_) {}
    fs.writeFileSync(file, 'line1\nsecret AKIAABCDEFGHIJKLMNOP\nline3');

    // dry-run should not change file
    const code1 = await runCli([repo, '--rotator', 'dry-run']);
    expect(code1).toBe(0);
    const content1 = fs.readFileSync(file, 'utf8');
    expect(content1).toContain('AKIAABCDEFGHIJKLMNOP');

    // apply with force should replace and create backup
    const code2 = await runCli([repo, '--rotator', 'apply', '--force']);
    expect(code2).toBe(0);
    const content2 = fs.readFileSync(file, 'utf8');
    expect(content2).toContain('__REPLACED_SECRET_');

    // backup should exist under .sentinel_tmp
    const tmpdir = path.join(process.cwd(), uniqueTmp);
    const entries = fs.existsSync(tmpdir) ? fs.readdirSync(tmpdir) : [];
    const bak = entries.find(
      (e) => e.includes('tmp-e2e-repo_secrets.txt.bak') || e.includes('tmp-e2e-repo_secrets.txt'),
    );
    expect(!!bak).toBe(true);

    // cleanup
    try {
      fs.rmSync(tmpdir, { recursive: true, force: true });
    } catch (_) {}
    try {
      fs.unlinkSync(file);
      fs.rmSync(repo, { recursive: true, force: true });
    } catch (_) {}
    delete process.env.SENTINEL_TMP_DIR;
  });
});
