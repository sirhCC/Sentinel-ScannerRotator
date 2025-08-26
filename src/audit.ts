import fs from 'fs/promises';
import path from 'path';

export type AuditEvent = Record<string, any>;

export async function createAuditWriter(filePath: string, append = false) {
  const dir = path.dirname(filePath);
  try { await fs.mkdir(dir, { recursive: true }); } catch {}
  if (!append) {
    try { await fs.writeFile(filePath, '', 'utf8'); } catch {}
  }
  async function writeLine(obj: AuditEvent) {
    const line = JSON.stringify(obj) + '\n';
    await fs.appendFile(filePath, line, 'utf8');
  }
  return {
    write: writeLine,
    async close() { /* no-op for now */ },
  };
}
