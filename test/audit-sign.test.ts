import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createAuditWriter } from '../src/audit';

describe('audit signing', () => {
  it('writes sha256 hash and optional HMAC signature', async () => {
    const dir = 'tmp-audit';
    const f = path.join(dir, 'audit.ndjson');
    try { fs.mkdirSync(dir); } catch {}
    process.env.SENTINEL_AUDIT_SIGN_KEY = 'test-key';
    process.env.SENTINEL_AUDIT_SIGN_KEY_ID = 'kid-1';
    const w = await createAuditWriter(f, false);
    await w.write({ ts: 1, file: 'x', match: 'y' });
    await w.close();
    const lines = fs.readFileSync(f, 'utf8').trim().split(/\r?\n/);
    expect(lines.length).toBe(1);
    const obj = JSON.parse(lines[0]);
    expect(obj.hash).toMatch(/^sha256-/);
    expect(obj.sig).toMatch(/^hmac-sha256-/);
    expect(obj.keyId).toBe('kid-1');
    delete process.env.SENTINEL_AUDIT_SIGN_KEY;
    delete process.env.SENTINEL_AUDIT_SIGN_KEY_ID;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });
});
