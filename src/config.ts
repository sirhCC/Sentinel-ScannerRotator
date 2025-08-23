import fs from 'fs/promises';
import path from 'path';

export type PatternDef = { name: string; regex: string };

export async function loadPatterns(): Promise<PatternDef[]> {
  const cfgPath = path.join(process.cwd(), 'config', 'defaults.json');
  try {
    const content = await fs.readFile(cfgPath, 'utf8');
    const parsed = JSON.parse(content);
    return parsed.patterns || [];
  } catch (e) {
    return [];
  }
}
