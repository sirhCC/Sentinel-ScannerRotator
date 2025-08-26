import fs from 'fs/promises';
import path from 'path';
import { Finding } from './types.js';

export type CacheEntry = {
  mtimeMs: number;
  size: number;
  findings: Finding[];
};

export type CacheData = {
  version: number;
  entries: Record<string, CacheEntry>;
};

export async function loadCache(filePath: string): Promise<CacheData> {
  try {
    const txt = await fs.readFile(filePath, 'utf8');
    const json = JSON.parse(txt);
    if (json && typeof json === 'object' && json.version === 1 && json.entries) {
      return json as CacheData;
    }
  } catch {}
  return { version: 1, entries: {} };
}

export async function saveCache(filePath: string, data: CacheData): Promise<void> {
  const dir = path.dirname(filePath);
  try { await fs.mkdir(dir, { recursive: true }); } catch {}
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}
