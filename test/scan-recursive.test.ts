import { describe, it, expect } from 'vitest';
import { scanPath } from '../src/scanner';
import fs from 'fs';
import path from 'path';

describe('recursive scanner', () => {
  it('scans nested files and respects .gitignore', async () => {
    const root = 'tmp-test-repo';
    const nestedDir = path.join(root, 'sub');
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(path.join(root, 'a.txt'), 'no secret here');
    fs.writeFileSync(path.join(nestedDir, 'b.txt'), 'here AKIAABCDEFGHIJKLMNOP is nested');
    // add .gitignore to ignore the nested directory
    fs.writeFileSync(path.join(root, '.gitignore'), 'sub');

    const res = await scanPath(root);

    // cleanup
    fs.rmSync(root, { recursive: true, force: true });

    // since 'sub' is ignored, findings should be 0
    expect(res.length).toBe(0);
  });
});
