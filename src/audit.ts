import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export type AuditEvent = Record<string, any>;

type AuditOptions = {
  signKey?: string | Buffer; // HMAC-SHA256 key (optional)
  keyId?: string; // optional key identifier to embed in events
};

function stableStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map((v) => stableStringify(v)).join(',') + ']';
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k]));
  return '{' + parts.join(',') + '}';
}

export async function createAuditWriter(filePath: string, append = false, options?: AuditOptions) {
  const dir = path.dirname(filePath);
  try { await fs.mkdir(dir, { recursive: true }); } catch {}
  if (!append) {
    try { await fs.writeFile(filePath, '', 'utf8'); } catch {}
  }
  async function writeLine(obj: AuditEvent) {
    const payloadStr = stableStringify(obj);
    const hash = crypto.createHash('sha256').update(payloadStr).digest('hex');
    const event: Record<string, any> = { ...obj, hash: `sha256-${hash}` };
    const key = options?.signKey ?? (process.env.SENTINEL_AUDIT_SIGN_KEY || '');
    const keyId = options?.keyId ?? process.env.SENTINEL_AUDIT_SIGN_KEY_ID;
    if (key && String(key).length > 0) {
      const sig = crypto.createHmac('sha256', key as any).update(hash).digest('hex');
      event.sig = `hmac-sha256-${sig}`;
      if (keyId) event.keyId = keyId;
    }
    const line = JSON.stringify(event) + '\n';
    await fs.appendFile(filePath, line, 'utf8');
  }
  return {
    write: writeLine,
    async close() { /* no-op for now */ },
  };
}
