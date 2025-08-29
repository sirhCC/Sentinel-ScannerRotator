import fs from "fs/promises";
import path from "path";
import { Finding } from "./types.js";
import { loadIgnorePatterns } from "./ignore.js";
import { loadCache, saveCache, CacheData } from './cache.js';
import { getScannerPlugins } from './plugins/scanners.js';
import crypto from 'crypto';

type ScanOptions = {
  concurrency?: number;
  cachePath?: string;
};

// Note: regex loading handled by plugins/scanners

export async function scanPath(targetPath: string, extraIg?: string[], baseDir?: string, options?: ScanOptions): Promise<Finding[]> {
  const stats = await fs.stat(targetPath);
  if (!baseDir) baseDir = stats.isFile() ? path.dirname(targetPath) : targetPath;
  if (stats.isFile()) return scanFile(targetPath, baseDir);

  const ig = await loadIgnorePatterns(targetPath, extraIg);
  const files: string[] = [];
  const scanRoot = path.resolve(targetPath);
  const excludes = new Set<string>();
  const backendFile = (process.env.SENTINEL_BACKEND_FILE || '').trim();
  if (backendFile) {
    const abs = path.resolve(backendFile);
    excludes.add(abs);
    if (abs.toLowerCase().endsWith('.json')) {
      excludes.add(abs.replace(/\.json$/i, '.history.ndjson'));
    } else {
      excludes.add(abs + '.history.ndjson');
    }
  }
  await walkDirCollect(scanRoot, scanRoot, ig as { ignores: (p: string) => boolean }, files, excludes);
  const envConc = Number(process.env.SENTINEL_SCAN_CONCURRENCY);
  const conc = Math.max(1, (options?.concurrency ?? (isNaN(envConc) ? undefined : envConc)) ?? 8);
  // Load cache if configured
  const cachePath = options?.cachePath || process.env.SENTINEL_CACHE || '';
  let cache: CacheData | undefined;
  const cacheMode = (process.env.SENTINEL_CACHE_MODE || 'mtime').toLowerCase();
  if (cachePath) {
    cache = await loadCache(cachePath);
  }
  const out: Finding[] = [];
  // simple worker pool
  let idx = 0;
  const scannedKeys = new Set<string>();
  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= files.length) break;
      const file = files[i];
      try {
        const key = path.relative(baseDir!, file);
        scannedKeys.add(key);
        if (cache) {
          const st = await fs.stat(file);
          const ce = cache.entries[key];
          let servedFromCache = false;
          if (ce && ce.mtimeMs === st.mtimeMs && ce.size === st.size) {
            if (cacheMode === 'hash') {
              try {
                const buf = await fs.readFile(file);
                const h = crypto.createHash('sha256').update(buf).digest('hex');
                if (ce.hash && ce.hash === h) {
                  out.push(...ce.findings);
                  servedFromCache = true;
                }
              } catch {}
            } else {
              out.push(...ce.findings);
              servedFromCache = true;
            }
          }
          if (servedFromCache) continue;
          const r = await scanFile(file, baseDir);
          out.push(...r);
          let hash: string | undefined;
          if (cacheMode === 'hash') {
            try {
              const buf = await fs.readFile(file);
              hash = crypto.createHash('sha256').update(buf).digest('hex');
            } catch {}
          }
          cache.entries[key] = { mtimeMs: st.mtimeMs, size: st.size, findings: r, hash };
          continue;
        }
        // no cache
        const r = await scanFile(file, baseDir);
        out.push(...r);
      } catch {
        // ignore
      }
    }
  }
  const workers = Array.from({ length: Math.min(conc, files.length || 1) }, () => worker());
  await Promise.all(workers);
  if (cachePath && cache) {
    // prune stale entries not part of this scan
    for (const k of Object.keys(cache.entries)) {
      if (!scannedKeys.has(k)) delete cache.entries[k];
    }
    try { await saveCache(cachePath, cache); } catch {}
  }
  return out;
}

async function walkDirCollect(dir: string, root: string, ig: { ignores: (p: string) => boolean }, files: string[], excludes?: Set<string>) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (excludes && excludes.has(full)) continue;
    const rel = path.relative(root, full) || e.name;
    if (ig.ignores(rel)) continue;
    if (e.isDirectory()) {
      await walkDirCollect(full, root, ig, files, excludes);
    } else if (e.isFile()) {
      files.push(full);
    }
  }
}

export async function scanFile(filePath: string, baseDir?: string): Promise<Finding[]> {
  // Choose a scanner plugin based on file type; fallback to text
  const plugins = getScannerPlugins();
  const plugin = plugins.find(p => p.supports(filePath)) || plugins[plugins.length - 1];
  return plugin.scan(filePath, baseDir ?? path.dirname(filePath));
}
