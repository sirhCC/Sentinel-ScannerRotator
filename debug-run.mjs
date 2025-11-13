import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const repo = 'tmp-ml-file-hook-debug2';
const hook = path.resolve('tmp-ml-file-hook-module2.mjs');
try {
  fs.mkdirSync(repo);
} catch {}
fs.writeFileSync(
  path.join(repo, 'a.txt'),
  '---- BEGIN PRIVATE KEY ----\nabc\n---- END PRIVATE KEY ----',
);
fs.writeFileSync(
  hook,
  `export function analyzeFile(lines, ctx){ const content = lines.join('\n'); if(content.includes('BEGIN PRIVATE KEY') && content.includes('END PRIVATE KEY')) return [{ token: 'PRIVATE_KEY_BLOCK', index: 0, ruleName: 'ML-File', severity: 'high' }]; }`,
);

const url = pathToFileURL(hook).href;
const mod = await import(url);
console.log('module keys', Object.keys(mod));
console.log('typeof analyzeFile', typeof mod.analyzeFile);

try {
  fs.rmSync(repo, { recursive: true, force: true });
} catch {}
try {
  fs.rmSync(hook, { force: true });
} catch {}
