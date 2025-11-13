import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import { Rotator } from '../types.js';
import { isRotator } from './schema.js';

type LoaderOptions = {
  extraDirs?: string[];
};

// isRotator imported from schema

async function listCandidateFiles(dir: string): Promise<string[]> {
  try {
    const files = await fs.readdir(dir);
    return files.filter((f) => /Rotator\.(ts|js|mjs|cjs)$/i.test(f)).map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

export async function loadRotators(opts: LoaderOptions = {}): Promise<Rotator[]> {
  const loaded: Record<string, Rotator> = {};

  // 0) Always include built-ins first to guarantee availability
  try {
    const mod1: any = await import('./dryRunRotator.js');
    const mod2: any = await import('./applyRotator.js');
    const mod3: any = await import('./backendRotator.js');
    const dr = mod1?.dryRunRotator;
    const ap = mod2?.applyRotator;
    const bk = mod3?.backendRotator;
    if (dr && !loaded[dr.name]) loaded[dr.name] = dr;
    if (ap && !loaded[ap.name]) loaded[ap.name] = ap;
    if (bk && !loaded[bk.name]) loaded[bk.name] = bk;
  } catch {
    // ignore
  }

  // 1) Try dynamic discovery from our rotators directory (works in src & dist)
  const here = path.dirname(new URL(import.meta.url).pathname);
  const builtinDir = here; // this file lives in rotators/
  const candidates = [...(await listCandidateFiles(builtinDir))];

  // 2) Add candidates from extraDirs (for tests or user-specified paths)
  if (opts.extraDirs) {
    for (const d of opts.extraDirs) {
      const sub = await listCandidateFiles(d);
      candidates.push(...sub);
    }
  }

  // Normalize and de-duplicate candidates
  const seen = new Set<string>();
  for (const fileRaw of candidates) {
    const file = path.normalize(fileRaw);
    if (seen.has(file)) continue;
    seen.add(file);
    try {
      const mod: any = await import(pathToFileURL(file).href);
      const exportsToCheck = [mod.default, ...Object.values(mod)];
      for (const ex of exportsToCheck) {
        if (isRotator(ex)) {
          if (!loaded[ex.name]) loaded[ex.name] = ex;
        }
      }
    } catch {
      // ignore bad modules
    }
  }

  return Object.values(loaded);
}
