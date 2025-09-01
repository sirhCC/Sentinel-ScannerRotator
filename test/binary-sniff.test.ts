import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { scanFile } from '../src/scanner';

describe('binary scanner sniffing', () => {
  it('skips obvious binary files with null bytes even when enabled', async () => {
    const tmp = path.join(process.cwd(), 'bin-null.dat');
    // Create a buffer with null bytes and random non-printables
    const buf = Buffer.alloc(1024, 0);
    for (let i = 0; i < buf.length; i += 17) buf[i] = 0x00;
    fs.writeFileSync(tmp, buf);
    const prev = process.env.SENTINEL_SCAN_BINARIES;
    process.env.SENTINEL_SCAN_BINARIES = 'true';
    const res = await scanFile(tmp);
    process.env.SENTINEL_SCAN_BINARIES = prev;
    fs.unlinkSync(tmp);
    expect(res.length).toBe(0);
  });

  it('scans small binary-typed file if it looks text-like and finds matches', async () => {
    const tmp = path.join(process.cwd(), 'bin-textlike.bin');
    fs.writeFileSync(tmp, 'This looks like text with an AWS key AKIAABCDEFGHIJKLMNOP');
    const prev = process.env.SENTINEL_SCAN_BINARIES;
    process.env.SENTINEL_SCAN_BINARIES = 'true';
    const res = await scanFile(tmp);
    process.env.SENTINEL_SCAN_BINARIES = prev;
    fs.unlinkSync(tmp);
    expect(res.some((f) => (f.match || '').includes('AKIA'))).toBe(true);
  });
});
