import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';
import { z } from 'zod';
// use dynamic import for js-yaml to avoid static type resolution failures when
// the package's types are not installed in the environment.

// Zod schema for pattern validation
const PatternDefSchema = z.object({
  name: z.string().min(1, 'Pattern name cannot be empty'),
  regex: z.string().min(1, 'Pattern regex cannot be empty').refine(
    (pattern) => {
      try {
        new RegExp(pattern);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Invalid regex pattern' }
  ),
  severity: z.enum(['low', 'medium', 'high']).optional(),
  enabled: z.boolean().optional(),
});

const PatternsArraySchema = z.array(PatternDefSchema);

export type PatternDef = z.infer<typeof PatternDefSchema>;

function validatePatterns(data: unknown): PatternDef[] {
  try {
    return PatternsArraySchema.parse(data);
  } catch (err) {
    if (process.env.SENTINEL_DEBUG === 'true') {
      console.error('[DEBUG] Pattern validation failed:', err);
    }
    if (err instanceof z.ZodError) {
      const issues = err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
      throw new Error(`Invalid pattern configuration: ${issues}`);
    }
    throw err;
  }
}

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
        const require = createRequire(import.meta.url);
        mod = require('js-yaml');
      } catch {
        // module not installed at runtime; treat as no config
      }
      if (mod && typeof mod.load === 'function') {
        const parsed = mod.load(c);
        if (parsed?.patterns) {
          return validatePatterns(parsed.patterns);
        }
        return [];
      }
    }
  if (await exists(rootJson)) {
      const c = await fs.readFile(rootJson, 'utf8');
      const parsed = JSON.parse(c);
      if (parsed?.patterns) {
        return validatePatterns(parsed.patterns);
      }
      return [];
    }
  if (await exists(defaults)) {
      const content = await fs.readFile(defaults, 'utf8');
      const parsed = JSON.parse(content);
      if (parsed?.patterns) {
        return validatePatterns(parsed.patterns);
      }
      return [];
    }
  } catch (err) {
    // Re-throw validation errors so they're not silently swallowed
    if (err instanceof Error && err.message.includes('Invalid pattern configuration')) {
      throw err;
    }
    if (process.env.SENTINEL_DEBUG === 'true') {
      console.error('[DEBUG] Failed to load patterns:', err);
    }
  }
  return [];
}

async function exists(p: string) {
  try { await fs.stat(p); return true; } catch { return false; }
}
