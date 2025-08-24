import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { scanPath } from '../src/scanner';

describe('config patterns', () => {
  it('loads patterns from config/defaults.json', async () => {
  const tmpdir = 'tmp-config-dir';
  try { fs.mkdirSync(tmpdir); } catch (_) {}
  const cfgDir = path.join(tmpdir, 'config');
  try { fs.mkdirSync(cfgDir); } catch (_) {}
  const cfgPath = path.join(cfgDir, 'defaults.json');
  // write a custom pattern into the temp repo's config
  const custom = { patterns: [{ name: 'TEST', regex: 'MYSECRET_[A-Z]+' }] };
  fs.writeFileSync(cfgPath, JSON.stringify(custom), 'utf8');

  const tmp = path.join(tmpdir, 'tmp-config.txt');
  fs.writeFileSync(tmp, 'here is MYSECRET_ABC in file');

  const res = await scanPath(tmpdir);

  // cleanup
  try { fs.unlinkSync(tmp); } catch {}
  try { fs.rmdirSync(tmpdir, { recursive: true }); } catch {}

  const found = res.find((f) => f.match.includes('MYSECRET_ABC'));
  expect(!!found).toBe(true);
  });
});
