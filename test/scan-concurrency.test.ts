import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { scanPath } from '../src/scanner';

describe('scan concurrency', () => {
  it('returns same findings with and without concurrency', async () => {
    const repo = 'tmp-scan-conc';
    try {
      fs.mkdirSync(repo);
    } catch {}
    fs.writeFileSync(path.join(repo, 'a.txt'), 'key=AKIAABCDEFGHIJKLMNOP');
    fs.writeFileSync(path.join(repo, 'b.txt'), 'token=AKIAABCDEFGHIJKLMNOP');
    const sequential = await scanPath(repo, undefined, undefined, { concurrency: 1 });
    const parallel = await scanPath(repo, undefined, undefined, { concurrency: 8 });
    // sort by file+line+col+match for stable comparison
    const sortFn = (x: any) => `${x.filePath}:${x.line}:${x.column}:${x.match}`;
    const s1 = sequential.map(sortFn).sort();
    const s2 = parallel.map(sortFn).sort();
    expect(s1).toEqual(s2);
    try {
      fs.rmSync(repo, { recursive: true, force: true });
    } catch {}
  });
});
