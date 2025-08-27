import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { scanPath } from '../src/scanner';

describe('ignore parsing', () => {
  it('respects .secretignore', async () => {
    const repo = 'tmp-ignore-repo';
    try { fs.mkdirSync(repo); } catch (_) {}
    fs.writeFileSync(path.join(repo, 'a.txt'), 'no secret');
    fs.mkdirSync(path.join(repo, 'sub'));
    fs.writeFileSync(path.join(repo, 'sub', 'b.txt'), 'secret AKIAABCDEFGHIJKLMNOP');
    fs.writeFileSync(path.join(repo, '.secretignore'), 'sub');

    const res = await scanPath(repo);

    // cleanup
    try { fs.rmSync(repo, { recursive: true }); } catch (_) {}

    expect(res.length).toBe(0);
  });

  it('respects --ignore globs', async () => {
    const repo = 'tmp-ignore2';
    try { fs.mkdirSync(repo); } catch (_) {}
    fs.writeFileSync(path.join(repo, 'keep.txt'), 'secret AKIAABCDEFGHIJKLMNOP');
    fs.writeFileSync(path.join(repo, 'skip.txt'), 'secret AKIAABCDEFGHIJKLMNOP');

    const res = await scanPath(repo, ['skip.txt']);

    try { fs.rmSync(repo, { recursive: true }); } catch (_) {}

    expect(res.find((r) => r.filePath.includes('keep.txt'))).toBeTruthy();
    expect(res.find((r) => r.filePath.includes('skip.txt'))).toBeFalsy();
  });

  it('respects .secretignore with absolute scan path', async () => {
    const repo = 'tmp-ignore-abs';
    try { fs.mkdirSync(repo); } catch (_) {}
    fs.writeFileSync(path.join(repo, 'root.txt'), 'no secret');
    fs.mkdirSync(path.join(repo, 'sub'));
    fs.writeFileSync(path.join(repo, 'sub', 'secret.txt'), 'AKIAABCDEFGHIJKLMNOP');
    fs.writeFileSync(path.join(repo, '.secretignore'), 'sub');

    const abs = path.resolve(repo);
    const res = await scanPath(abs);

    // cleanup
    try { fs.rmSync(repo, { recursive: true }); } catch (_) {}

    expect(res.find((r) => r.filePath.includes(path.join('sub', 'secret.txt')))).toBeFalsy();
  });
});
