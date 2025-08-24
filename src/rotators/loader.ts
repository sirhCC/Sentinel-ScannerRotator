import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import { Rotator } from '../types';

type LoaderOptions = {
  extraDirs?: string[];
};

function isRotator(obj: any): obj is Rotator {
  return obj && typeof obj.name === 'string' && typeof obj.rotate === 'function';
}

async function listCandidateFiles(dir: string): Promise<string[]> {
  try {
    const files = await fs.readdir(dir);
    return files
      .filter((f) => /Rotator\.(ts|js|mjs|cjs)$/i.test(f))
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

export async function loadRotators(opts: LoaderOptions = {}): Promise<Rotator[]> {
  const loaded: Record<string, Rotator> = {};

  // 1) Try dynamic discovery from our rotators directory (works in src & dist)
  const here = path.dirname(new URL(import.meta.url).pathname);
  const builtinDir = here; // this file lives in rotators/
  const candidates = [
    ...await listCandidateFiles(builtinDir),
  ];

  // 2) Add candidates from extraDirs (for tests or user-specified paths)
  if (opts.extraDirs) {
    for (const d of opts.extraDirs) {
      const sub = await listCandidateFiles(d);
      candidates.push(...sub);
    }
  }

  for (const file of candidates) {
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

  // 3) Fallback: ensure at least built-ins are present
  if (!loaded['dry-run'] || !loaded['apply']) {
    try {
      const mod1: any = await import('./dryRunRotator.js').catch(() => import('./dryRunRotator'));
      const mod2: any = await import('./applyRotator.js').catch(() => import('./applyRotator'));
      const dr = mod1?.dryRunRotator;
      const ap = mod2?.applyRotator;
      if (dr && !loaded[dr.name]) loaded[dr.name] = dr;
      if (ap && !loaded[ap.name]) loaded[ap.name] = ap;
    } catch {
      // ignore
    }
  }

  return Object.values(loaded);
}
