import { describe, it, expect } from 'vitest';
import { scanFile } from '../src/scanner';
import fs from 'fs';

describe('scanner', () => {
  it('finds aws key in sample text', async () => {
    const tmp = 'test-sample.txt';
  fs.writeFileSync(tmp, 'here is a key AKIAABCDEFGHIJKLMNOP in a file');
    const res = await scanFile(tmp);
    fs.unlinkSync(tmp);
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].match).toContain('AKIA');
  });
});
