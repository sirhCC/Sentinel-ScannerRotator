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
  try { fs.rmdirSync(tmp, { recursive: true }); } catch (_) {}
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
    try { fs.rmdirSync(repo, { recursive: true }); } catch {}
    expect(code).toBe(0);
  });
});
