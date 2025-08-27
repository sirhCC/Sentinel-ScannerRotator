import { describe, it, expect } from 'vitest';
import { runCli } from '../src/index';

describe('cli', () => {
  it('prints help and exits 0', async () => {
    const code = await runCli(['--help']);
    expect(code).toBe(0);
  });
  it('refuses apply without force', async () => {
    const code = await runCli(['.', '--rotator', 'apply']);
    expect(code).toBe(3);
  });

  it('allows apply with force (dry-run off)', async () => {
  const tmp = 'tmp-cli-dir';
  const fs = require('fs');
  try { fs.mkdirSync(tmp); } catch (_) {}
  const code = await runCli([tmp, '--rotator', 'apply', '--force']);
  // cleanup
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  expect(code).toBe(0);
  });

  it('accepts --config path (file or dir) and runs', async () => {
    const fs = require('fs');
    const path = require('path');
    const repo = 'tmp-cli-conf';
    try { fs.mkdirSync(repo); } catch {}
    const cfg = { patterns: [ { name: 'CLI_TEST', regex: 'CLICONF' } ] };
    const cfgPath = path.join(repo, '.secretsentinel.json');
    fs.writeFileSync(cfgPath, JSON.stringify(cfg));
    const code = await runCli([repo, '--rotator', 'dry-run', '--config', cfgPath]);
  try { fs.rmSync(repo, { recursive: true, force: true }); } catch {}
    expect(code).toBe(0);
  });

  it('loads a custom rotator via --rotators-dir and selects it', async () => {
    const fs = require('fs');
    const path = require('path');
    const repo = 'tmp-cli-rot';
    const plug = 'tmp-cli-plugins';
    try { fs.mkdirSync(repo); } catch {}
    try { fs.mkdirSync(plug); } catch {}
    const rfile = path.join(plug, 'customRotator.js');
    fs.writeFileSync(rfile, `export const custom = { name: 'custom', async rotate() { return { success: true, message: 'custom' }; } };`);
    const code = await runCli([repo, '--rotators-dir', plug, '--rotator', 'custom', '--dry-run']);
    try { fs.rmSync(repo, { recursive: true }); } catch {}
    try { fs.rmSync(plug, { recursive: true }); } catch {}
    expect(code).toBe(0);
  });

  it('lists available rotators and exits 0', async () => {
    const code = await runCli(['--list-rotators']);
    expect(code).toBe(0);
  });

  it('lists available rulesets and exits 0', async () => {
  const code = await runCli(['--list-rulesets']);
  expect(code).toBe(0);
  });

  it('fails fast with --fail-on-findings', async () => {
    const fs = require('fs');
    const path = require('path');
    const repo = 'tmp-cli-fail';
    const f = path.join(repo, 's.txt');
    try { fs.mkdirSync(repo); } catch {}
    fs.writeFileSync(f, 'AKIAABCDEFGHIJKLMNOP');
    const code = await runCli([repo, '--rotator', 'dry-run', '--fail-on-findings']);
    try { fs.rmSync(repo, { recursive: true, force: true }); } catch {}
    expect(code).toBe(4);
  });

  it('applies with a custom template via --template', async () => {
    const fs = require('fs');
    const path = require('path');
  const uniqueTmp = `.sentinel_tmp_${Date.now()}_${Math.random()}`;
  process.env.SENTINEL_TMP_DIR = uniqueTmp;
    const repo = 'tmp-cli-template';
    const f = path.join(repo, 's.txt');
    try { fs.mkdirSync(repo); } catch {}
    fs.writeFileSync(f, 'before AKIAABCDEFGHIJKLMNOP after');
    const code = await runCli([repo, '--rotator', 'apply', '--force', '--template', '__CLI_{{timestamp}}__']);
    const content = fs.readFileSync(f, 'utf8');
    try { fs.rmSync(repo, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(uniqueTmp, { recursive: true, force: true }); } catch {}
  delete process.env.SENTINEL_TMP_DIR;
    expect(code).toBe(0);
    expect(content).toMatch(/__CLI_\d+__/);
  });

  it('undo restores last backup for a file', async () => {
    const fs = require('fs');
    const path = require('path');
    const uniqueTmp = `.sentinel_tmp_${Date.now()}_${Math.random()}`;
    process.env.SENTINEL_TMP_DIR = uniqueTmp;
    const repo = 'tmp-cli-undo';
    const f = path.join(repo, 's.txt');
    try { fs.mkdirSync(repo); } catch {}
    fs.writeFileSync(f, 'before AKIAABCDEFGHIJKLMNOP after');
    // rotate to produce a backup
    let code = await runCli([repo, '--rotator', 'apply', '--force', '--template', '__UNDO__']);
    expect(code).toBe(0);
    // Now undo on that file
    code = await runCli(['undo', f]);
    const content = fs.readFileSync(f, 'utf8');
    try { fs.rmSync(repo, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(uniqueTmp, { recursive: true, force: true }); } catch {}
    delete process.env.SENTINEL_TMP_DIR;
    expect(code).toBe(0);
    expect(content).toContain('AKIAABCDEFGHIJKLMNOP');
  });
});
