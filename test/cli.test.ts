import { describe, it, expect } from 'vitest';
import { runCli } from '../src/index';

describe('cli', () => {
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
});
