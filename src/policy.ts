import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';
import { z } from 'zod';
import { getLogger } from './logger.js';

// Zod schema for policy validation
const PolicySchema = z.object({
  thresholds: z
    .object({
      total: z.number().int().nonnegative().optional(),
      high: z.number().int().nonnegative().optional(),
      medium: z.number().int().nonnegative().optional(),
      low: z.number().int().nonnegative().optional(),
    })
    .optional(),
  forbidRules: z.array(z.string().min(1)).optional(),
  minSeverity: z.enum(['low', 'medium', 'high']).optional(),
});

export type Policy = z.infer<typeof PolicySchema>;

type RawConfig = { policy?: unknown };

function validatePolicy(data: unknown): Policy {
  try {
    return PolicySchema.parse(data);
  } catch (err) {
    if (process.env.SENTINEL_DEBUG === 'true') {
      getLogger().debug('Policy validation failed', { error: String(err) });
    }
    if (err instanceof z.ZodError) {
      const issues = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      throw new Error(`Invalid policy configuration: ${issues}`);
    }
    throw err;
  }
}

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
        if (parsed && parsed.policy) {
          return validatePolicy(parsed.policy);
        }
      }
    }
    if (await exists(rootJson)) {
      const c = await fs.readFile(rootJson, 'utf8');
      const parsed = JSON.parse(c) as RawConfig;
      if (parsed && parsed.policy) {
        return validatePolicy(parsed.policy);
      }
    }
    if (await exists(defaults)) {
      const c = await fs.readFile(defaults, 'utf8');
      const parsed = JSON.parse(c) as RawConfig;
      if (parsed && parsed.policy) {
        return validatePolicy(parsed.policy);
      }
    }
  } catch (err) {
    // Re-throw validation errors so they're not silently swallowed
    if (err instanceof Error && err.message.includes('Invalid policy configuration')) {
      throw err;
    }
    if (process.env.SENTINEL_DEBUG === 'true') {
      getLogger().debug('Failed to load policy', { error: String(err) });
    }
  }
  return undefined;
}

async function exists(p: string) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}
