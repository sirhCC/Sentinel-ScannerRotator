import fs from "fs/promises";
import path from "path";
import { Finding } from "./types.js";
import { loadIgnorePatterns } from "./ignore.js";
import { loadCache, saveCache, CacheData } from './cache.js';
import { loadPatterns } from "./config.js";

type ScanOptions = {
  concurrency?: number;
  cachePath?: string;
};

async function loadSecretRegexes(baseDir?: string) {
  const defs = await loadPatterns(baseDir);
  const builtins = [
    { name: "AWS Access Key ID", re: /AKIA[0-9A-Z]{16}/g },
    { name: "Generic API Key", re: /(?:api_key|apikey|api-key)\s*[:=]\s*['\"]?([A-Za-z0-9-_]{16,})/gi },
    { name: "JWT-Like", re: /eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g },
  ];
  if (defs.length === 0) return builtins;
  const custom = defs.map((d) => ({ name: d.name, re: new RegExp(d.regex, 'g') }));
  return builtins.concat(custom);
}

export async function scanPath(targetPath: string, extraIg?: string[], baseDir?: string, options?: ScanOptions): Promise<Finding[]> {
  const stats = await fs.stat(targetPath);
  if (!baseDir) baseDir = stats.isFile() ? path.dirname(targetPath) : targetPath;
  if (stats.isFile()) return scanFile(targetPath, baseDir);

  const ig = await loadIgnorePatterns(targetPath, extraIg);
  const files: string[] = [];
  await walkDirCollect(targetPath, ig as { ignores: (p: string) => boolean }, files);
  const envConc = Number(process.env.SENTINEL_SCAN_CONCURRENCY);
  const conc = Math.max(1, (options?.concurrency ?? (isNaN(envConc) ? undefined : envConc)) ?? 8);
  // Load cache if configured
  const cachePath = options?.cachePath || process.env.SENTINEL_CACHE || '';
  let cache: CacheData | undefined;
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
      try {
        const file = files[i];
        if (cache) {
          try {
            const st = await fs.stat(file);
            const key = path.relative(baseDir!, file);
            scannedKeys.add(key);
            const ce = cache.entries[key];
            if (ce && ce.mtimeMs === st.mtimeMs && ce.size === st.size) {
              out.push(...ce.findings);
              continue;
            }
            const r = await scanFile(file, baseDir);
            out.push(...r);
            cache.entries[key] = { mtimeMs: st.mtimeMs, size: st.size, findings: r };
            continue;
          } catch {
            // fall through to no-cache path
          }
        }
        const r = await scanFile(file, baseDir);
        if (cache) {
          try {
            const st = await fs.stat(file);
            const key = path.relative(baseDir!, file);
            scannedKeys.add(key);
            cache.entries[key] = { mtimeMs: st.mtimeMs, size: st.size, findings: r };
          } catch {}
        }
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

async function walkDirCollect(dir: string, ig: { ignores: (p: string) => boolean }, files: string[]) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = path.relative(process.cwd(), full);
    if (ig.ignores(rel)) continue;
    if (e.isDirectory()) {
      await walkDirCollect(full, ig, files);
    } else if (e.isFile()) {
      files.push(full);
    }
  }
}

export async function scanFile(filePath: string, baseDir?: string): Promise<Finding[]> {
  const SECRET_REGEXES = await loadSecretRegexes(baseDir ?? path.dirname(filePath));
  const content = await fs.readFile(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const findings: Finding[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const s of SECRET_REGEXES) {
      let m: RegExpExecArray | null;
      const re = new RegExp(s.re.source, s.re.flags);
      while ((m = re.exec(line)) !== null) {
        findings.push({
          filePath,
          line: i + 1,
          column: m.index + 1,
          match: m[0],
          context: line.trim().slice(0, 200),
        });
      }
    }
  }
  return findings;
}
