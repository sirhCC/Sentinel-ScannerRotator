import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';

export type Policy = {
  thresholds?: { total?: number; high?: number; medium?: number; low?: number };
  forbidRules?: string[];
  minSeverity?: 'low' | 'medium' | 'high';
};

type RawConfig = { policy?: Policy };

export async function loadPolicy(baseDir?: string): Promise<Policy | undefined> {
  const cwd = baseDir || process.cwd();
  const rootYaml = path.join(cwd, '.secretsentinel.yaml');
  const rootJson = path.join(cwd, '.secretsentinel.json');
  const defaults = path.join(cwd, 'config', 'defaults.json');
  // prefer project root file policy if present
  try {
    if (await exists(rootYaml)) {
      const c = await fs.readFile(rootYaml, 'utf8');
      let mod: any = null;
      try {
        const require = createRequire(import.meta.url);
        mod = require('js-yaml');
      } catch {}
      if (mod && typeof mod.load === 'function') {
        const parsed = mod.load(c) as RawConfig;
        if (parsed && parsed.policy) return parsed.policy;
      }
    }
    if (await exists(rootJson)) {
      const c = await fs.readFile(rootJson, 'utf8');
      const parsed = JSON.parse(c) as RawConfig;
      if (parsed && parsed.policy) return parsed.policy;
    }
    if (await exists(defaults)) {
      const c = await fs.readFile(defaults, 'utf8');
      const parsed = JSON.parse(c) as RawConfig;
      if (parsed && parsed.policy) return parsed.policy;
    }
  } catch (err) {
    if (process.env.SENTINEL_DEBUG === 'true') {
      console.error('[DEBUG] Failed to load policy:', err);
    }
  }
  return undefined;
}

async function exists(p: string) {
  try { await fs.stat(p); return true; } catch { return false; }
}
