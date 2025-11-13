import { describe, it, expect } from 'vitest';
import { scanFile } from '../src/scanner';
import fs from 'fs';

describe('rules with severity and entropy', () => {
  it('emits ruleName and severity for built-in rule', async () => {
    const tmp = 'test-severity.txt';
    fs.writeFileSync(tmp, 'token AKIAABCDEFGHIJKLMNOP here');
    const res = await scanFile(tmp);
    fs.unlinkSync(tmp);
    const hit = res.find((r) => r.ruleName === 'AWS Access Key ID');
    expect(hit).toBeTruthy();
    expect(hit?.severity).toBeDefined();
  });

  it('entropy can detect high randomness when enabled', async () => {
    const prev = process.env.SENTINEL_ENTROPY;
    process.env.SENTINEL_ENTROPY = 'true';
    const tmp = 'test-entropy.txt';
    // 48-char base64-ish random-like string
    fs.writeFileSync(
      tmp,
      'maybe secret: QWxhZGRpbjpvcGVuIHNlc2FtZQ== Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MDEy',
    );
    const res = await scanFile(tmp);
    fs.unlinkSync(tmp);
    process.env.SENTINEL_ENTROPY = prev;
    expect(res.length).toBeGreaterThan(0);
  });
});
