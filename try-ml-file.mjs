import fs from 'fs';
import path from 'path';
const { scanPath } = await import('./dist/scanner.js');

const repo = 'tmp-ml-file-repro';
const hookFile = path.resolve('tmp-ml-file-repro-hook.mjs');
try {
  fs.mkdirSync(repo);
} catch {}
fs.writeFileSync(
  path.join(repo, 'a.txt'),
  '---- BEGIN PRIVATE KEY ----\nabc\n---- END PRIVATE KEY ----',
);
fs.writeFileSync(
  hookFile,
  "export function analyzeFile(lines, ctx){ const content = lines.join('\\n'); if(content.includes('BEGIN PRIVATE KEY') && content.includes('END PRIVATE KEY')) return [{ token: 'PRIVATE_KEY_BLOCK', index: 0, ruleName: 'ML-File', severity: 'high' }]; }",
);
process.env.SENTINEL_ML_HOOK = hookFile;
process.env.SENTINEL_ML_MODE = 'file';
const results = await scanPath(repo);
console.log('results', results);
try {
  fs.rmSync(repo, { recursive: true, force: true });
} catch {}
try {
  fs.rmSync(hookFile, { force: true });
} catch {}
