import fs from 'fs/promises';
import path from 'path';
import { Finding, ScanResult } from './types.js';
import { loadIgnorePatterns } from './ignore.js';
import { loadCache, saveCache, CacheData } from './cache.js';
import { getScannerPlugins } from './plugins/scanners.js';
import crypto from 'crypto';
import { Worker } from 'worker_threads';
import { getChangedFiles, isGitRepository } from './gitIntegration.js';
import { getLogger } from './logger.js';
import { DEFAULT_SCAN_CONCURRENCY, MIN_CONCURRENCY, DEFAULT_CACHE_MODE } from './constants.js';

type ScanOptions = {
  concurrency?: number;
  cachePath?: string;
  /**
   * Enable incremental scanning (only scan files changed in git)
   * Requires: git repository + cache enabled
   * Auto-enabled when in git repo with cache unless explicitly set to false
   */
  incremental?: boolean;
  /**
   * Git base ref for incremental scanning (default: HEAD)
   */
  gitBase?: string;
};

// Note: regex loading handled by plugins/scanners

/**
 * Scan a file or directory for secret findings
 *
 * @param targetPath - Path to file or directory to scan
 * @param extraIg - Additional ignore patterns to apply
 * @param baseDir - Base directory for relative path resolution
 * @param options - Scan configuration options
 * @returns Promise resolving to array of findings
 *
 * @example
 * ```typescript
 * const findings = await scanPath('./src', ['*.test.ts'], '/project');
 * ```
 */
export async function scanPath(
  targetPath: string,
  extraIg?: string[],
  baseDir?: string,
  options?: ScanOptions,
): Promise<Finding[]> {
  const stats = await fs.stat(targetPath);
  if (!baseDir) baseDir = stats.isFile() ? path.dirname(targetPath) : targetPath;
  if (stats.isFile()) return scanFile(targetPath, baseDir);

  const ig = await loadIgnorePatterns(targetPath, extraIg);
  let files: string[] = [];
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
  await walkDirCollect(
    scanRoot,
    scanRoot,
    ig as { ignores: (p: string) => boolean },
    files,
    excludes,
  );
  const envConc = Number(process.env.SENTINEL_SCAN_CONCURRENCY);
  const conc = Math.max(
    MIN_CONCURRENCY,
    options?.concurrency ?? (isNaN(envConc) ? undefined : envConc) ?? DEFAULT_SCAN_CONCURRENCY,
  );
  // Load cache if configured
  const cachePath = options?.cachePath || process.env.SENTINEL_CACHE || '';
  let cache: CacheData | undefined;
  const cacheMode = (process.env.SENTINEL_CACHE_MODE || DEFAULT_CACHE_MODE).toLowerCase();
  if (cachePath) {
    cache = await loadCache(cachePath);
  }

  // Incremental scanning: filter to only changed files if enabled
  let incrementalMode = false;
  const unchangedCachedFindings: Finding[] = [];
  if (options?.incremental === true && cachePath && cache) {
    // Auto-enable incremental if in git repo with cache (unless explicitly disabled)
    const inGitRepo = await isGitRepository(scanRoot);
    if (inGitRepo) {
      const gitDiff = await getChangedFiles({
        base: options?.gitBase,
        repoPath: scanRoot,
      });
      if (gitDiff.isGitRepo && gitDiff.changedFiles.length > 0) {
        // Filter files to only those changed in git
        const changedSet = new Set(gitDiff.changedFiles.map((f) => path.normalize(f)));
        const originalCount = files.length;
        const filteredFiles = files.filter((f) => changedSet.has(path.normalize(f)));

        // Only enable incremental mode if we have changed files in the scan scope
        // If all files are filtered out, fall back to full scan
        if (filteredFiles.length > 0 || Object.keys(cache.entries).length > 0) {
          files = filteredFiles;
          incrementalMode = true;

          // Collect cached findings from unchanged files
          for (const [key, entry] of Object.entries(cache.entries)) {
            const fullPath = path.resolve(baseDir, key);
            if (!changedSet.has(path.normalize(fullPath))) {
              unchangedCachedFindings.push(...entry.findings);
            }
          }

          if (process.env.SENTINEL_DEBUG === 'true') {
            getLogger().debug(
              `Incremental scan: ${files.length}/${originalCount} files changed, ${unchangedCachedFindings.length} cached findings from unchanged files`,
            );
          }
        }
      }
    }
  }
  const out: Finding[] = [...unchangedCachedFindings];
  // Optional worker_threads pool (disabled in tests by default)
  let pool: WorkerPool | undefined;
  try {
    const disableInTest = !!(process.env.VITEST || process.env.NODE_ENV === 'test');
    const requested = Number(process.env.SENTINEL_WORKERS || '0');
    const count = disableInTest ? 0 : Math.max(0, requested);
    if (count > 0) {
      pool = await WorkerPool.tryCreate(count);
    }
  } catch {
    pool = undefined;
  }
  // simple worker loop (uses pool when available)
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
          // When in hash mode, compute the hash at most once and reuse it later on save
          let precomputedHash: string | undefined;
          if (ce && ce.mtimeMs === st.mtimeMs && ce.size === st.size) {
            if (cacheMode === 'hash') {
              try {
                const buf = await fs.readFile(file);
                const h = crypto.createHash('sha256').update(buf).digest('hex');
                precomputedHash = h;
                if (ce.hash && ce.hash === h) {
                  out.push(...ce.findings);
                  servedFromCache = true;
                }
              } catch {
                // Cache hash computation failed, will scan file normally
              }
            } else {
              out.push(...ce.findings);
              servedFromCache = true;
            }
          }
          if (servedFromCache) continue;
          const r = pool ? await pool.scan(file, baseDir) : await scanFileWithHash(file, baseDir);
          out.push(...r.findings);
          let hash: string | undefined;
          if (cacheMode === 'hash') {
            try {
              // Reuse the earlier computed hash when available to avoid an extra read
              if (precomputedHash) {
                hash = precomputedHash;
              } else {
                hash =
                  r.computedHash ??
                  (await (async () => {
                    const buf = await fs.readFile(file);
                    return crypto.createHash('sha256').update(buf).digest('hex');
                  })());
              }
            } catch {
              // Hash computation failed, cache entry will use mtime/size only
            }
          }
          cache.entries[key] = { mtimeMs: st.mtimeMs, size: st.size, findings: r.findings, hash };
          continue;
        }
        // no cache
        const r = pool ? await pool.scan(file, baseDir) : await scanFileWithHash(file, baseDir);
        out.push(...r.findings);
      } catch (err) {
        // File scan failed, skip this file and continue
        if (process.env.SENTINEL_DEBUG === 'true') {
          getLogger().debug('Failed to scan file', { file, error: String(err) });
        }
      }
    }
  }
  const workers = Array.from({ length: Math.min(conc, files.length || 1) }, () => worker());
  await Promise.all(workers);
  if (cachePath && cache) {
    // prune stale entries not part of this scan (but not in incremental mode)
    if (!incrementalMode) {
      for (const k of Object.keys(cache.entries)) {
        if (!scannedKeys.has(k)) delete cache.entries[k];
      }
    }
    try {
      await saveCache(cachePath, cache);
    } catch (err) {
      if (process.env.SENTINEL_DEBUG === 'true') {
        getLogger().debug('Failed to save cache', { error: err });
      }
    }
  }
  return out;
}

/**
 * Recursively collect all scannable files in a directory
 * @param dir - Directory to walk
 * @param root - Root directory for relative path calculation
 * @param ig - Ignore pattern matcher
 * @param files - Accumulator array for discovered files
 * @param excludes - Set of absolute paths to exclude
 */
async function walkDirCollect(
  dir: string,
  root: string,
  ig: { ignores: (p: string) => boolean },
  files: string[],
  excludes?: Set<string>,
) {
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

/**
 * Scan a single file for secret findings
 * @param filePath - Path to the file to scan
 * @param baseDir - Base directory for relative path resolution
 * @returns Promise resolving to array of findings
 */
export async function scanFile(filePath: string, baseDir?: string): Promise<Finding[]> {
  // Choose a scanner plugin based on file type; fallback to text
  const plugins = getScannerPlugins();
  const plugin = plugins.find((p) => p.supports(filePath)) || plugins[plugins.length - 1];
  const res = await plugin.scan(filePath, baseDir ?? path.dirname(filePath));
  return res.findings;
}

async function scanFileWithHash(filePath: string, baseDir?: string): Promise<ScanResult> {
  const plugins = getScannerPlugins();
  const plugin = plugins.find((p) => p.supports(filePath)) || plugins[plugins.length - 1];
  return plugin.scan(filePath, baseDir ?? path.dirname(filePath));
}

// Lightweight worker pool wrapper
class WorkerPool {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private queue: Array<{
    file: string;
    baseDir?: string;
    resolve: (r: ScanResult) => void;
    reject: (e: any) => void;
  }> = [];
  private constructor(
    private workerFile: string,
    size: number,
  ) {
    for (let i = 0; i < size; i++) {
      const w = new Worker(workerFile, { execArgv: [], env: process.env as any });
      this.bind(w);
      this.workers.push(w);
      this.idle.push(w);
    }
  }
  static async tryCreate(size: number): Promise<WorkerPool | undefined> {
    // prefer dist/worker/scanWorker.js
    const candidate = path.resolve(process.cwd(), 'dist', 'worker', 'scanWorker.js');
    try {
      const st = await fs.stat(candidate);
      if (!st.isFile()) return undefined;
      return new WorkerPool(candidate, size);
    } catch {
      return undefined;
    }
  }
  private bind(w: Worker) {
    w.on('message', (msg: any) => {
      const task = this.currentTaskMap.get(w);
      if (!task) return;
      this.currentTaskMap.delete(w);
      this.idle.push(w);
      if (msg && msg.ok && msg.result) task.resolve(msg.result as ScanResult);
      else if (msg && msg.error) task.reject(new Error(String(msg.error)));
      else task.resolve({ findings: [] });
      this.pump();
    });
    w.on('error', (err) => {
      const task = this.currentTaskMap.get(w);
      this.currentTaskMap.delete(w);
      this.idle = this.idle.filter((x) => x !== w);
      if (task) task.reject(err);
    });
    w.on('exit', () => {
      this.idle = this.idle.filter((x) => x !== w);
      this.workers = this.workers.filter((x) => x !== w);
    });
  }
  private currentTaskMap = new Map<
    Worker,
    { file: string; baseDir?: string; resolve: (r: ScanResult) => void; reject: (e: any) => void }
  >();
  private pump() {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.pop()!;
      const t = this.queue.shift()!;
      this.currentTaskMap.set(w, t);
      w.postMessage({ filePath: t.file, baseDir: t.baseDir });
    }
  }
  scan(file: string, baseDir?: string): Promise<ScanResult> {
    return new Promise((resolve, reject) => {
      this.queue.push({ file, baseDir, resolve, reject });
      this.pump();
    });
  }
  destroy() {
    for (const w of this.workers) {
      try {
        void w.terminate();
      } catch {}
    }
    this.workers = [];
    this.idle = [];
  }
}
