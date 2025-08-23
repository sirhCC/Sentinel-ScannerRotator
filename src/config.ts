import fs from 'fs/promises';
import path from 'path';
// use dynamic import for js-yaml to avoid static type resolution failures when
// the package's types are not installed in the environment.

export type PatternDef = { name: string; regex: string };

export async function loadPatterns(baseDir?: string): Promise<PatternDef[]> {
  const cwd = baseDir || process.cwd();
  // priority: project root config (.secretsentinel.yaml/.json) -> config/defaults.json
  const rootYaml = path.join(cwd, '.secretsentinel.yaml');
  const rootJson = path.join(cwd, '.secretsentinel.json');
  const defaults = path.join(cwd, 'config', 'defaults.json');
  try {
  if (await exists(rootYaml)) {
      const c = await fs.readFile(rootYaml, 'utf8');
      // avoid static import so tsc doesn't require the module to be present
      let mod: any = null;
      try {
        const req = eval('require');
        mod = req('js-yaml');
      } catch (e) {
        // module not installed at runtime; treat as no config
      }
      if (mod && typeof mod.load === 'function') {
        const parsed = mod.load(c) as any;
        return parsed?.patterns || [];
      }
    }
  if (await exists(rootJson)) {
      const c = await fs.readFile(rootJson, 'utf8');
      const parsed = JSON.parse(c);
      return parsed?.patterns || [];
    }
  if (await exists(defaults)) {
      const content = await fs.readFile(defaults, 'utf8');
      const parsed = JSON.parse(content);
      return parsed.patterns || [];
    }
  } catch (e) {
    // ignore
  }
  return [];
}

async function exists(p: string) {
  try { await fs.stat(p); return true; } catch { return false; }
}
