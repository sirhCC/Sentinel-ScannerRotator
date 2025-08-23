import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { scanPath } from '../src/scanner';

describe('config patterns', () => {
  it('loads patterns from config/defaults.json', async () => {
    const cfgDir = path.join(process.cwd(), 'config');
    const cfgPath = path.join(cfgDir, 'defaults.json');
    const original = fs.readFileSync(cfgPath, 'utf8');
    // write a custom pattern
    const custom = { patterns: [{ name: 'TEST', regex: 'MYSECRET_[A-Z]+' }] };
    fs.writeFileSync(cfgPath, JSON.stringify(custom), 'utf8');

  const tmpdir = 'tmp-config-dir';
  try { fs.mkdirSync(tmpdir); } catch (_) {}
  const tmp = tmpdir + '/tmp-config.txt';
  fs.writeFileSync(tmp, 'here is MYSECRET_ABC in file');

  const res = await scanPath(tmpdir);

  // cleanup
  fs.unlinkSync(tmp);
  try { fs.rmdirSync(tmpdir); } catch (_) {}
  fs.writeFileSync(cfgPath, original, 'utf8');

  const found = res.find((f) => f.match.includes('MYSECRET_ABC'));
  expect(!!found).toBe(true);
  });
});
