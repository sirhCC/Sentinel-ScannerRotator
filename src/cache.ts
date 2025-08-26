import fs from 'fs/promises';
import path from 'path';
import { Finding } from './types.js';

export type CacheEntry = {
  mtimeMs: number;
  size: number;
  findings: Finding[];
  hash?: string;
};

export type CacheData = {
  version: number; // 1 = mtime/size only, 2 = optional hash
  entries: Record<string, CacheEntry>;
};

export async function loadCache(filePath: string): Promise<CacheData> {
  try {
    const txt = await fs.readFile(filePath, 'utf8');
    const json = JSON.parse(txt);
    if (json && typeof json === 'object') {
      if ((json.version === 2 || json.version === 1) && json.entries) {
        return json as CacheData;
      }
    }
  } catch {}
  return { version: 2, entries: {} };
}

export async function saveCache(filePath: string, data: CacheData): Promise<void> {
  const dir = path.dirname(filePath);
  try { await fs.mkdir(dir, { recursive: true }); } catch {}
  const toWrite: CacheData = { version: 2, entries: data.entries };
  await fs.writeFile(filePath, JSON.stringify(toWrite, null, 2), 'utf8');
}
