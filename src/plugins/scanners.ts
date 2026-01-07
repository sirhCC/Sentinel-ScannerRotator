import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import JSZip from 'jszip';
import tar from 'tar-stream';
import zlib from 'zlib';
import readline from 'readline';
import { Finding, ScanResult } from '../types.js';
import { newMetrics } from '../metrics.js';
import { getLogger } from '../logger.js';
import { loadRules, type Rule } from '../rules/ruleset.js';
import { findHighEntropyTokens } from '../rules/entropy.js';

export type ScannerPlugin = {
  name: string;
  supports(filePath: string): boolean;
  scan(filePath: string, baseDir?: string): Promise<ScanResult>;
};

type MlSpan = { start: number; end?: number; length?: number };
type MlToken = {
  token: string;
  index: number;
  ruleName?: string;
  severity?: 'low' | 'medium' | 'high';
  confidence?: number; // 0..1
  tags?: string[];
  span?: MlSpan; // optional precise span; if provided, prefer start/length over index
  message?: string;
};
type MlLineHook = (
  line: string,
  ctx: { filePath: string; lineNumber: number },
) => Promise<MlToken[] | undefined> | MlToken[] | undefined;
type MlFileHook = (
  lines: string[],
  ctx: { filePath: string },
) => Promise<MlToken[] | undefined> | MlToken[] | undefined;
type MlHooks = { line?: MlLineHook; file?: MlFileHook };
const mlCache = new Map<string, Promise<MlHooks>>();
function getMlSpec(): string {
  return (process.env.SENTINEL_ML_HOOK || '').trim();
}
async function loadMlHooks(spec: string): Promise<MlHooks> {
  if (!spec) return {};
  const existing = mlCache.get(spec);
  if (existing) return existing;
  const p = (async () => {
    try {
      let toImportUrl = path.isAbsolute(spec) ? pathToFileURL(spec).href : spec;
      if (path.isAbsolute(spec)) {
        try {
          const st = fsSync.statSync(spec);
          const u = new URL(toImportUrl);
          u.searchParams.set('v', String(st.mtimeMs));
          toImportUrl = u.href;
        } catch {}
      }
      const mod: any = await import(toImportUrl);
      let line: MlLineHook | undefined;
      let file: MlFileHook | undefined;
      if (typeof mod?.analyzeLine === 'function') line = mod.analyzeLine as MlLineHook;
      if (typeof mod?.analyzeFile === 'function') file = mod.analyzeFile as MlFileHook;
      // Also support modules that default-export an object with analyzeLine/analyzeFile
      if (!line && typeof mod?.default?.analyzeLine === 'function')
        line = mod.default.analyzeLine as MlLineHook;
      if (!file && typeof mod?.default?.analyzeFile === 'function')
        file = mod.default.analyzeFile as MlFileHook;
      if (!line && !file && typeof mod?.default === 'function') {
        const defAny: any = mod.default;
        if ((defAny?.length ?? 0) >= 2) line = defAny as MlLineHook;
        else file = defAny as MlFileHook;
      }
      return { line, file } as MlHooks;
    } catch (err) {
      if (process.env.SENTINEL_DEBUG === 'true') {
        getLogger().debug('Failed to load ML hook', { spec, error: String(err) });
      }
      return {} as MlHooks;
    }
  })();
  mlCache.set(spec, p);
  return p;
}
function getMlMode(): 'line' | 'file' | 'both' {
  const m = (process.env.SENTINEL_ML_MODE || 'line').toLowerCase();
  return m === 'file' || m === 'both' ? (m as any) : 'line';
}

// Map confidence (0..1) to severity if severity is missing
function severityFromConfidence(conf?: number): 'low' | 'medium' | 'high' {
  const c = isFinite(Number(conf)) ? Math.max(0, Math.min(1, Number(conf))) : 0.5;
  if (c >= 0.8) return 'high';
  if (c >= 0.4) return 'medium';
  return 'low';
}

function normalizeMlToken(t: MlToken): MlToken & { severity: 'low' | 'medium' | 'high' } {
  return { ...t, severity: t.severity || severityFromConfidence(t.confidence) } as any;
}

// Helper to call the ML hook with a time budget and metrics
async function callMlHook(
  hook: MlLineHook,
  line: string,
  ctx: { filePath: string; lineNumber: number },
): Promise<MlToken[] | undefined> {
  const budget = Number(process.env.SENTINEL_ML_MAX_MS || '0'); // 0 = no timeout
  const start = Date.now();
  const g = globalThis as any;
  try {
    if (!g.__sentinelMetrics) g.__sentinelMetrics = newMetrics();
    g.__sentinelMetrics.ml_invocations_total++;
  } catch {}
  try {
    const p = Promise.resolve(hook(line, ctx));
    const res =
      budget > 0
        ? await Promise.race<MlToken[] | undefined>([
            p,
            new Promise<MlToken[] | undefined>((resolve) =>
              setTimeout(() => resolve(undefined), budget),
            ),
          ])
        : await p;
    const dur = Date.now() - start;
    try {
      g.__sentinelMetrics.ml_time_ms_total += dur;
    } catch {}
    return res;
  } catch {
    const dur = Date.now() - start;
    try {
      g.__sentinelMetrics.ml_errors_total++;
      g.__sentinelMetrics.ml_time_ms_total += dur;
    } catch {}
    return undefined;
  }
}
async function callMlFileHook(
  hook: MlFileHook,
  lines: string[],
  ctx: { filePath: string },
): Promise<MlToken[] | undefined> {
  const budget = Number(process.env.SENTINEL_ML_MAX_MS || '0');
  const start = Date.now();
  const g = globalThis as any;
  try {
    if (!g.__sentinelMetrics) g.__sentinelMetrics = newMetrics();
    g.__sentinelMetrics.ml_invocations_total++;
  } catch {}
  try {
    const p = Promise.resolve(hook(lines, ctx));
    const res =
      budget > 0
        ? await Promise.race<MlToken[] | undefined>([
            p,
            new Promise<MlToken[] | undefined>((resolve) =>
              setTimeout(() => resolve(undefined), budget),
            ),
          ])
        : await p;
    const dur = Date.now() - start;
    try {
      g.__sentinelMetrics.ml_time_ms_total += dur;
    } catch {}
    return res;
  } catch {
    const dur = Date.now() - start;
    try {
      g.__sentinelMetrics.ml_errors_total++;
      g.__sentinelMetrics.ml_time_ms_total += dur;
    } catch {}
    return undefined;
  }
}

// Optional RE2 engine support with safe fallback to native RegExp
type RegexCtor = new (pattern: string, flags?: string) => RegExp;
let chosenCtor: RegexCtor | undefined;
async function getRegexCtor(): Promise<RegexCtor> {
  if (chosenCtor) return chosenCtor;
  const engine = (process.env.SENTINEL_REGEX_ENGINE || 'native').toLowerCase();
  if (engine === 're2') {
    try {
      // @ts-ignore optional dependency; resolved at runtime if installed
      const mod: any = await import('re2');
      chosenCtor = (mod?.default ?? mod) as RegexCtor;
    } catch {
      chosenCtor = RegExp; // fallback
    }
  } else {
    chosenCtor = RegExp;
  }
  return chosenCtor;
}

async function compileRuleSet(rules: Array<{ re: RegExp; name: string; severity: any }>) {
  const Ctor = await getRegexCtor();
  // Bump metric (best-effort; create an ad-hoc metrics object if none exists)
  try {
    // In absence of global registry, we rely on a global instance if present
    const g = globalThis as any;
    if (!g.__sentinelMetrics) g.__sentinelMetrics = newMetrics();
    g.__sentinelMetrics.rules_compiled_total += rules.length;
  } catch {}
  return rules.map((s) => {
    try {
      return { s, re: new Ctor(s.re.source, s.re.flags) };
    } catch {
      return { s, re: new RegExp(s.re.source, s.re.flags) };
    }
  });
}

// Per-run cache of compiled rule sets to avoid reloading/compiling per file
type CompiledSet = { raw: Rule[]; compiled: Array<{ s: Rule; re: RegExp }> };
const compiledCache = new Map<string, Promise<CompiledSet>>();
function rulesCacheKey(baseDir?: string): string {
  const engine = (process.env.SENTINEL_REGEX_ENGINE || 'native').toLowerCase();
  const b = baseDir ? path.resolve(baseDir) : '';
  // Include env toggles that affect rule selection in the key to be safe across runs
  const disable = (process.env.SENTINEL_DISABLE_BUILTIN_RULES || '').toLowerCase();
  const rs = process.env.SENTINEL_RULESETS || '';
  const rsd = process.env.SENTINEL_RULESETS_DIRS || '';
  return [engine, b, disable, rs, rsd].join('|');
}
async function getCompiledRules(baseDir?: string): Promise<CompiledSet> {
  const key = rulesCacheKey(baseDir);
  const existing = compiledCache.get(key);
  if (existing) return existing;
  const p = (async () => {
    const raw = await loadRules(baseDir);
    const compiled = await compileRuleSet(raw);
    return { raw, compiled } as CompiledSet;
  })();
  compiledCache.set(key, p);
  return p;
}

export const textScanner: ScannerPlugin = {
  name: 'text',
  supports: () => true, // fallback for regular files
  async scan(filePath: string, baseDir?: string): Promise<ScanResult> {
    // Early skip: empty files
    try {
      const st = await fs.stat(filePath);
      if (st.size === 0) {
        const hashMode = (process.env.SENTINEL_CACHE_MODE || 'mtime').toLowerCase() === 'hash';
        const computedHash = hashMode
          ? (await import('crypto')).createHash('sha256').update('').digest('hex')
          : undefined;
        return { findings: [], computedHash };
      }
      const fileMax = Number(process.env.SENTINEL_TEXT_FILE_MAX_BYTES || '0');
      if (fileMax > 0 && st.size > fileMax) return { findings: [] };
    } catch {}
    const { compiled: COMPILED } = await getCompiledRules(baseDir ?? path.dirname(filePath));
    const findings: Finding[] = [];
    const hashMode = (process.env.SENTINEL_CACHE_MODE || 'mtime').toLowerCase() === 'hash';
    const hasher = hashMode ? (await import('crypto')).createHash('sha256') : undefined;
    const useEntropy = (process.env.SENTINEL_ENTROPY ?? 'false').toLowerCase();
    const enableEntropy = useEntropy === 'true' || useEntropy === '1' || useEntropy === 'yes';
    const mode = getMlMode();
    const mlSpec = getMlSpec();
    const hooks = mlSpec ? await loadMlHooks(mlSpec) : {};
    const maxBytes = Number(process.env.SENTINEL_TEXT_MAX_BYTES || '0'); // 0 = unlimited
    const rs = fsSync.createReadStream(filePath, { encoding: 'utf8' });
    let readBytes = 0;
    let aborted = false;
    if (maxBytes > 0) {
      rs.on('data', (chunk: string | Buffer) => {
        const inc = typeof chunk === 'string' ? Buffer.byteLength(chunk, 'utf8') : chunk.length;
        readBytes += inc;
        if (!aborted && readBytes > maxBytes) {
          aborted = true;
          rs.destroy();
        }
      });
    }
    const rl = readline.createInterface({ input: rs, crlfDelay: Infinity });
    const maxLine = Number(process.env.SENTINEL_TEXT_LINE_MAX_BYTES || '0');
    let lineNo = 0;
    for await (const line of rl) {
      lineNo++;
      if (hasher) hasher.update(line + '\n');
      if (maxLine > 0 && Buffer.byteLength(line, 'utf8') > maxLine) {
        try {
          const g = globalThis as any;
          if (!g.__sentinelMetrics) g.__sentinelMetrics = newMetrics();
          g.__sentinelMetrics.files_skipped_total++;
          g.__sentinelMetrics.files_skipped_by_reason['line-too-long'] =
            (g.__sentinelMetrics.files_skipped_by_reason['line-too-long'] || 0) + 1;
        } catch {}
        continue;
      }
      for (const { s, re } of COMPILED) {
        let m: RegExpExecArray | null;
        re.lastIndex = 0;
        while ((m = re.exec(line)) !== null) {
          findings.push({
            filePath,
            line: lineNo,
            column: m.index + 1,
            match: m[0],
            context: line.trim().slice(0, 200),
            ruleName: s.name,
            severity: s.severity,
          });
        }
      }
      if (hooks.line && (mode === 'line' || mode === 'both')) {
        const tokens = await callMlHook(hooks.line, line, { filePath, lineNumber: lineNo });
        if (tokens && Array.isArray(tokens)) {
          try {
            const g = globalThis as any;
            if (!g.__sentinelMetrics) g.__sentinelMetrics = newMetrics();
            g.__sentinelMetrics.ml_findings_total += tokens.length;
          } catch {}
          for (const raw of tokens) {
            const t = normalizeMlToken(raw);
            const column = (t.span?.start ?? t.index) + 1;
            findings.push({
              filePath,
              line: lineNo,
              column,
              match: t.token,
              context: line.trim().slice(0, 200),
              ruleName: t.ruleName || 'ML-Hook',
              severity: t.severity,
              confidence: t.confidence,
              tags: t.tags,
              message: t.message,
            });
          }
        }
      }
      if (enableEntropy) {
        const hits = findHighEntropyTokens(line);
        for (const h of hits) {
          findings.push({
            filePath,
            line: lineNo,
            column: h.index + 1,
            match: h.token,
            context: line.trim().slice(0, 200),
            ruleName: 'High-Entropy Token',
            severity: 'medium',
          });
        }
      }
    }
    // Optional file-level ML hook
    if (hooks.file && (mode === 'file' || mode === 'both' || !hooks.line)) {
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const linesArr = content.split(/\r?\n/);
        const toks = await callMlFileHook(hooks.file, linesArr, { filePath });
        if (Array.isArray(toks)) {
          try {
            const g = globalThis as any;
            if (!g.__sentinelMetrics) g.__sentinelMetrics = newMetrics();
            g.__sentinelMetrics.ml_findings_total += toks.length;
          } catch {}
          for (const raw of toks) {
            const t = normalizeMlToken(raw);
            const column = (t.span?.start ?? t.index) + 1;
            findings.push({
              filePath,
              line: 1,
              column,
              match: t.token,
              context: (linesArr[0] || '').trim().slice(0, 200),
              ruleName: t.ruleName || 'ML-Hook',
              severity: t.severity,
              confidence: t.confidence,
              tags: t.tags,
              message: t.message,
            });
          }
        }
      } catch {}
    }
    const computedHash = hasher ? hasher.digest('hex') : undefined;
    return { findings, computedHash };
  },
};

function sensitiveKeyRegex() {
  return /(pass(word)?|secret|token|api[_-]?key|private[_-]?key|auth|cred|access[_-]?key)/i;
}

export const envScanner: ScannerPlugin = {
  name: 'env',
  supports(filePath: string) {
    const b = path.basename(filePath).toLowerCase();
    return b === '.env' || b.startsWith('.env.') || b.endsWith('.env');
  },
  async scan(filePath: string, baseDir?: string): Promise<ScanResult> {
    // Early skip: empty files
    try {
      const st = await fs.stat(filePath);
      if (st.size === 0) {
        const hashMode = (process.env.SENTINEL_CACHE_MODE || 'mtime').toLowerCase() === 'hash';
        const computedHash = hashMode
          ? (await import('crypto')).createHash('sha256').update('').digest('hex')
          : undefined;
        return { findings: [], computedHash };
      }
      const fileMax = Number(process.env.SENTINEL_TEXT_FILE_MAX_BYTES || '0');
      if (fileMax > 0 && st.size > fileMax) return { findings: [] };
    } catch {}
    const { compiled: COMPILED } = await getCompiledRules(baseDir ?? path.dirname(filePath));
    const findings: Finding[] = [];
    const hashMode = (process.env.SENTINEL_CACHE_MODE || 'mtime').toLowerCase() === 'hash';
    const hasher = hashMode
      ? await import('crypto').then((m) => m.createHash('sha256'))
      : undefined;
    // built-in regexes
    const useEntropy = (process.env.SENTINEL_ENTROPY ?? 'false').toLowerCase();
    const enableEntropy = useEntropy === 'true' || useEntropy === '1' || useEntropy === 'yes';
    const mode = getMlMode();
    const mlSpec = getMlSpec();
    const hooks = mlSpec ? await loadMlHooks(mlSpec) : {};
    const maxBytes = Number(process.env.SENTINEL_TEXT_MAX_BYTES || '0');
    const rs = fsSync.createReadStream(filePath, { encoding: 'utf8' });
    let readBytes = 0;
    let aborted = false;
    if (maxBytes > 0) {
      rs.on('data', (chunk: string | Buffer) => {
        const inc = typeof chunk === 'string' ? Buffer.byteLength(chunk, 'utf8') : chunk.length;
        readBytes += inc;
        if (!aborted && readBytes > maxBytes) {
          aborted = true;
          rs.destroy();
        }
      });
    }
    const rl = readline.createInterface({ input: rs, crlfDelay: Infinity });
    const maxLine = Number(process.env.SENTINEL_TEXT_LINE_MAX_BYTES || '0');
    let lineNo = 0;
    for await (const line of rl) {
      lineNo++;
      if (hasher) hasher.update(line + '\n');
      if (maxLine > 0 && Buffer.byteLength(line, 'utf8') > maxLine) {
        try {
          const g = globalThis as any;
          if (!g.__sentinelMetrics) g.__sentinelMetrics = newMetrics();
          g.__sentinelMetrics.files_skipped_total++;
          g.__sentinelMetrics.files_skipped_by_reason['line-too-long'] =
            (g.__sentinelMetrics.files_skipped_by_reason['line-too-long'] || 0) + 1;
        } catch {}
        continue;
      }
      for (const { s, re } of COMPILED) {
        let m: RegExpExecArray | null;
        re.lastIndex = 0;
        while ((m = re.exec(line)) !== null) {
          findings.push({
            filePath,
            line: lineNo,
            column: m.index + 1,
            match: m[0],
            context: line.trim().slice(0, 200),
            ruleName: s.name,
            severity: s.severity,
          });
        }
      }
      // sensitive key heuristics
      const kv = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)\s*$/; // .env format
      const mm = kv.exec(line);
      if (mm && sensitiveKeyRegex().test(mm[1]) && mm[2].length >= 12) {
        findings.push({
          filePath,
          line: lineNo,
          column: line.indexOf(mm[2]) + 1,
          match: mm[2],
          context: line.trim().slice(0, 200),
        });
      }
      if (hooks.line && (mode === 'line' || mode === 'both')) {
        const tokens = await callMlHook(hooks.line, line, { filePath, lineNumber: lineNo });
        if (tokens && Array.isArray(tokens)) {
          try {
            const g = globalThis as any;
            if (!g.__sentinelMetrics) g.__sentinelMetrics = newMetrics();
            g.__sentinelMetrics.ml_findings_total += tokens.length;
          } catch {}
          for (const raw of tokens) {
            const t = normalizeMlToken(raw);
            const column = (t.span?.start ?? t.index) + 1;
            findings.push({
              filePath,
              line: lineNo,
              column,
              match: t.token,
              context: line.trim().slice(0, 200),
              ruleName: t.ruleName || 'ML-Hook',
              severity: t.severity,
              confidence: t.confidence,
              tags: t.tags,
              message: t.message,
            });
          }
        }
      }
      if (enableEntropy) {
        const hits = findHighEntropyTokens(line);
        for (const h of hits) {
          findings.push({
            filePath,
            line: lineNo,
            column: h.index + 1,
            match: h.token,
            context: line.trim().slice(0, 200),
            ruleName: 'High-Entropy Token',
            severity: 'medium',
          });
        }
      }
    }
    if (hooks.file && (mode === 'file' || mode === 'both' || !hooks.line)) {
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const linesArr = content.split(/\r?\n/);
        const toks = await callMlFileHook(hooks.file, linesArr, { filePath });
        if (Array.isArray(toks)) {
          try {
            const g = globalThis as any;
            if (!g.__sentinelMetrics) g.__sentinelMetrics = newMetrics();
            g.__sentinelMetrics.ml_findings_total += toks.length;
          } catch {}
          for (const raw of toks) {
            const t = normalizeMlToken(raw);
            const column = (t.span?.start ?? t.index) + 1;
            findings.push({
              filePath,
              line: 1,
              column,
              match: t.token,
              context: (linesArr[0] || '').trim().slice(0, 200),
              ruleName: t.ruleName || 'ML-Hook',
              severity: t.severity,
              confidence: t.confidence,
              tags: t.tags,
              message: t.message,
            });
          }
        }
      } catch {}
    }
    const computedHash = hasher ? hasher.digest('hex') : undefined;
    return { findings, computedHash };
  },
};

export const dockerScanner: ScannerPlugin = {
  name: 'dockerfile',
  supports(filePath: string) {
    const b = path.basename(filePath);
    const l = b.toLowerCase();
    return b === 'Dockerfile' || l.startsWith('dockerfile.') || l.endsWith('.dockerfile');
  },
  async scan(filePath: string, baseDir?: string): Promise<ScanResult> {
    // Early skip: empty files
    try {
      const st = await fs.stat(filePath);
      if (st.size === 0) {
        const hashMode = (process.env.SENTINEL_CACHE_MODE || 'mtime').toLowerCase() === 'hash';
        const computedHash = hashMode
          ? (await import('crypto')).createHash('sha256').update('').digest('hex')
          : undefined;
        return { findings: [], computedHash };
      }
      const fileMax = Number(process.env.SENTINEL_TEXT_FILE_MAX_BYTES || '0');
      if (fileMax > 0 && st.size > fileMax) return { findings: [] };
    } catch {}
    const { compiled: COMPILED } = await getCompiledRules(baseDir ?? path.dirname(filePath));
    const findings: Finding[] = [];
    const hashMode = (process.env.SENTINEL_CACHE_MODE || 'mtime').toLowerCase() === 'hash';
    const hasher = hashMode
      ? await import('crypto').then((m) => m.createHash('sha256'))
      : undefined;
    const useEntropy = (process.env.SENTINEL_ENTROPY ?? 'false').toLowerCase();
    const enableEntropy = useEntropy === 'true' || useEntropy === '1' || useEntropy === 'yes';
    const mode = getMlMode();
    const mlSpec = getMlSpec();
    const hooks = mlSpec ? await loadMlHooks(mlSpec) : {};
    const maxBytes = Number(process.env.SENTINEL_TEXT_MAX_BYTES || '0');
    const rs = fsSync.createReadStream(filePath, { encoding: 'utf8' });
    let readBytes = 0;
    let aborted = false;
    if (maxBytes > 0) {
      rs.on('data', (chunk: string | Buffer) => {
        const inc = typeof chunk === 'string' ? Buffer.byteLength(chunk, 'utf8') : chunk.length;
        readBytes += inc;
        if (!aborted && readBytes > maxBytes) {
          aborted = true;
          rs.destroy();
        }
      });
    }
    const rl = readline.createInterface({ input: rs, crlfDelay: Infinity });
    const maxLine = Number(process.env.SENTINEL_TEXT_LINE_MAX_BYTES || '0');
    let lineNo = 0;
    for await (const line of rl) {
      lineNo++;
      if (hasher) hasher.update(line + '\n');
      if (maxLine > 0 && Buffer.byteLength(line, 'utf8') > maxLine) {
        try {
          const g = globalThis as any;
          if (!g.__sentinelMetrics) g.__sentinelMetrics = newMetrics();
          g.__sentinelMetrics.files_skipped_total++;
          g.__sentinelMetrics.files_skipped_by_reason['line-too-long'] =
            (g.__sentinelMetrics.files_skipped_by_reason['line-too-long'] || 0) + 1;
        } catch {}
        continue;
      }
      for (const { s, re } of COMPILED) {
        let m: RegExpExecArray | null;
        re.lastIndex = 0;
        while ((m = re.exec(line)) !== null) {
          findings.push({
            filePath,
            line: lineNo,
            column: m.index + 1,
            match: m[0],
            context: line.trim().slice(0, 200),
            ruleName: s.name,
            severity: s.severity,
          });
        }
      }
      // ENV/ARG key=value
      const mm = /^\s*(ENV|ARG)\s+([A-Za-z_][A-Za-z0-9_]*)=(.+)\s*$/i.exec(line);
      if (mm && sensitiveKeyRegex().test(mm[2]) && mm[3].length >= 12) {
        const value = mm[3];
        findings.push({
          filePath,
          line: lineNo,
          column: line.indexOf(value) + 1,
          match: value,
          context: line.trim().slice(0, 200),
        });
      }
      if (hooks.line && (mode === 'line' || mode === 'both')) {
        const tokens = await callMlHook(hooks.line, line, { filePath, lineNumber: lineNo });
        if (tokens && Array.isArray(tokens)) {
          try {
            const g = globalThis as any;
            if (!g.__sentinelMetrics) g.__sentinelMetrics = newMetrics();
            g.__sentinelMetrics.ml_findings_total += tokens.length;
          } catch {}
          for (const t of tokens) {
            findings.push({
              filePath,
              line: lineNo,
              column: t.index + 1,
              match: t.token,
              context: line.trim().slice(0, 200),
              ruleName: t.ruleName || 'ML-Hook',
              severity: t.severity || 'medium',
            });
          }
        }
      }
      if (enableEntropy) {
        const hits = findHighEntropyTokens(line);
        for (const h of hits) {
          findings.push({
            filePath,
            line: lineNo,
            column: h.index + 1,
            match: h.token,
            context: line.trim().slice(0, 200),
            ruleName: 'High-Entropy Token',
            severity: 'medium',
          });
        }
      }
    }
    if (hooks.file && (mode === 'file' || mode === 'both' || !hooks.line)) {
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const linesArr = content.split(/\r?\n/);
        const toks = await callMlFileHook(hooks.file, linesArr, { filePath });
        if (Array.isArray(toks)) {
          try {
            const g = globalThis as any;
            if (!g.__sentinelMetrics) g.__sentinelMetrics = newMetrics();
            g.__sentinelMetrics.ml_findings_total += toks.length;
          } catch {}
          for (const t of toks) {
            findings.push({
              filePath,
              line: 1,
              column: t.index + 1,
              match: t.token,
              context: (linesArr[0] || '').trim().slice(0, 200),
              ruleName: t.ruleName || 'ML-Hook',
              severity: t.severity || 'medium',
            });
          }
        }
      } catch {}
    }
    const computedHash = hasher ? hasher.digest('hex') : undefined;
    return { findings, computedHash };
  },
};

export const binaryScanner: ScannerPlugin = {
  name: 'binary',
  supports(filePath: string) {
    const l = filePath.toLowerCase();
    // Skip known text-like extensions, target unknown/binary-ish files under size threshold
    const textExts = [
      '.txt',
      '.md',
      '.json',
      '.yaml',
      '.yml',
      '.ts',
      '.js',
      '.tsx',
      '.jsx',
      '.env',
      '.dockerfile',
    ];
    const ext = path.extname(l);
    if (!ext) return true;
    return !textExts.includes(ext);
  },
  async scan(filePath: string, baseDir?: string): Promise<ScanResult> {
    const allow = (process.env.SENTINEL_SCAN_BINARIES ?? 'false').toLowerCase();
    if (!(allow === 'true' || allow === '1' || allow === 'yes')) return { findings: [] };
    const { compiled: COMPILED } = await getCompiledRules(baseDir ?? path.dirname(filePath));
    try {
      const buf = await fs.readFile(filePath);
      // Guardrails
      const maxBytes = Number(process.env.SENTINEL_BIN_MAX_BYTES || '2097152'); // 2 MiB
      if (buf.length > maxBytes) return { findings: [] };
      // Quick sniff: skip if looks like binary (many non-printable or null bytes)
      const sample = buf.subarray(0, Math.min(buf.length, 4096));
      let nonText = 0;
      for (let i = 0; i < sample.length; i++) {
        const c = sample[i];
        const isText = c === 0x09 || c === 0x0a || c === 0x0d || (c >= 0x20 && c <= 0x7e);
        if (!isText) nonText++;
        if (c === 0x00) {
          nonText = sample.length;
          break;
        }
      }
      if (nonText / sample.length > 0.3) return { findings: [] };
      // Naive decode: try utf8; for failures, replace invalids
      const text = buf.toString('utf8');
      const findings: Finding[] = [];
      const lines = text.split(/\r?\n/);
      const maxLine = Number(process.env.SENTINEL_TEXT_LINE_MAX_BYTES || '0');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (maxLine > 0 && Buffer.byteLength(line, 'utf8') > maxLine) {
          try {
            const g = globalThis as any;
            if (!g.__sentinelMetrics) g.__sentinelMetrics = newMetrics();
            g.__sentinelMetrics.files_skipped_total++;
            g.__sentinelMetrics.files_skipped_by_reason['line-too-long'] =
              (g.__sentinelMetrics.files_skipped_by_reason['line-too-long'] || 0) + 1;
          } catch {}
          continue;
        }
        for (const { s, re } of COMPILED) {
          let m: RegExpExecArray | null;
          while ((m = re.exec(line)) !== null) {
            findings.push({
              filePath,
              line: i + 1,
              column: m.index + 1,
              match: m[0],
              context: line.trim().slice(0, 200),
              ruleName: s.name,
              severity: s.severity,
            });
          }
        }
      }
      const hashMode = (process.env.SENTINEL_CACHE_MODE || 'mtime').toLowerCase() === 'hash';
      const computedHash = hashMode
        ? (await import('crypto')).createHash('sha256').update(buf).digest('hex')
        : undefined;
      return { findings, computedHash };
    } catch (err) {
      if (process.env.SENTINEL_DEBUG === 'true') {
        console.error('[DEBUG] Binary scanner error:', filePath, err);
      }
      return { findings: [] };
    }
  },
};

export const zipScanner: ScannerPlugin = {
  name: 'zip',
  supports(filePath: string) {
    return filePath.toLowerCase().endsWith('.zip');
  },
  async scan(filePath: string, baseDir?: string): Promise<ScanResult> {
    const allowArchives = (process.env.SENTINEL_SCAN_ARCHIVES ?? 'true').toLowerCase();
    if (allowArchives === 'false' || allowArchives === '0' || allowArchives === 'no')
      return { findings: [] };
    const fileStat = await fs.stat(filePath).catch(() => undefined as any);
    const fileMax = Number(process.env.SENTINEL_ZIP_FILE_MAX_BYTES || '0');
    if (fileMax > 0 && fileStat?.size && fileStat.size > fileMax) return { findings: [] };
    const buf = await fs.readFile(filePath);
    const hashMode = (process.env.SENTINEL_CACHE_MODE || 'mtime').toLowerCase() === 'hash';
    const computedHash = hashMode
      ? (await import('crypto')).createHash('sha256').update(buf).digest('hex')
      : undefined;
    const zip = await JSZip.loadAsync(buf);
    const { compiled: COMPILED } = await getCompiledRules(baseDir ?? path.dirname(filePath));
    const findings: Finding[] = [];
    const maxEntries = Number(process.env.SENTINEL_ZIP_MAX_ENTRIES || '1000');
    const maxEntryBytes = Number(process.env.SENTINEL_ZIP_MAX_ENTRY_BYTES || '1048576'); // 1 MiB
    const maxBytes = Number(process.env.SENTINEL_ZIP_MAX_BYTES || '10485760'); // 10 MiB
    const globalMax = Number(process.env.SENTINEL_ARCHIVES_GLOBAL_MAX_BYTES || '0'); // 0 = unlimited
    // Module-level global tracker
    const g = globalThis as unknown as { __sentinelArchiveBytes?: number };
    if (g.__sentinelArchiveBytes === undefined) g.__sentinelArchiveBytes = 0;
    let count = 0;
    let totalBytes = 0;
    type ZipEntry = { dir?: boolean; name: string; async: (t: 'string') => Promise<string> };
    const entries = Object.values(zip.files) as unknown as ZipEntry[];
    const mlSpec = getMlSpec();
    const hooks = mlSpec ? await loadMlHooks(mlSpec) : {};
    for (const entry of entries) {
      if (count++ >= maxEntries) break;
      if (entry.dir) continue;
      // Only attempt to parse as text (utf8) for now
      let content: string;
      try {
        content = await entry.async('string');
      } catch {
        continue;
      }
      const bytes = Buffer.byteLength(content, 'utf8');
      if (bytes > maxEntryBytes) continue;
      if (totalBytes + bytes > maxBytes) break;
      if (globalMax > 0 && g.__sentinelArchiveBytes + bytes > globalMax) break;
      totalBytes += bytes;
      g.__sentinelArchiveBytes += bytes;
      const lines = content.split(/\r?\n/);
      const maxLine = Number(process.env.SENTINEL_TEXT_LINE_MAX_BYTES || '0');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (maxLine > 0 && Buffer.byteLength(line, 'utf8') > maxLine) {
          try {
            const g = globalThis as any;
            if (!g.__sentinelMetrics) g.__sentinelMetrics = newMetrics();
            g.__sentinelMetrics.files_skipped_total++;
            g.__sentinelMetrics.files_skipped_by_reason['line-too-long'] =
              (g.__sentinelMetrics.files_skipped_by_reason['line-too-long'] || 0) + 1;
          } catch {}
          continue;
        }
        for (const { s, re } of COMPILED) {
          let m: RegExpExecArray | null;
          re.lastIndex = 0;
          while ((m = re.exec(line)) !== null) {
            findings.push({
              filePath: `${filePath}:${entry.name}`,
              line: i + 1,
              column: m.index + 1,
              match: m[0],
              context: line.trim().slice(0, 200),
              ruleName: s.name,
              severity: s.severity,
            });
          }
        }
        if (hooks.line) {
          try {
            const tokens = await callMlHook(hooks.line, line, {
              filePath: `${filePath}:${entry.name}`,
              lineNumber: i + 1,
            });
            if (tokens && Array.isArray(tokens)) {
              for (const raw of tokens) {
                const t = normalizeMlToken(raw);
                const column = (t.span?.start ?? t.index) + 1;
                findings.push({
                  filePath: `${filePath}:${entry.name}`,
                  line: i + 1,
                  column,
                  match: t.token,
                  context: line.trim().slice(0, 200),
                  ruleName: t.ruleName || 'ML-Hook',
                  severity: t.severity,
                  confidence: t.confidence,
                  tags: t.tags,
                  message: t.message,
                });
              }
            }
          } catch {}
        }
      }
    }
    return { findings, computedHash };
  },
};

export const tarGzScanner: ScannerPlugin = {
  name: 'targz',
  supports(filePath: string) {
    const l = filePath.toLowerCase();
    return l.endsWith('.tar.gz') || l.endsWith('.tgz');
  },
  async scan(filePath: string, baseDir?: string): Promise<ScanResult> {
    const allowArchives = (process.env.SENTINEL_SCAN_ARCHIVES ?? 'true').toLowerCase();
    if (allowArchives === 'false' || allowArchives === '0' || allowArchives === 'no')
      return { findings: [] } as any;
    const { compiled: COMPILED } = await getCompiledRules(baseDir ?? path.dirname(filePath));
    const findings: Finding[] = [];
    const maxEntries = Number(process.env.SENTINEL_TAR_MAX_ENTRIES || '1000');
    const maxEntryBytes = Number(process.env.SENTINEL_TAR_MAX_ENTRY_BYTES || '1048576'); // 1 MiB
    const maxBytes = Number(process.env.SENTINEL_TAR_MAX_BYTES || '10485760'); // 10 MiB
    const fileStat = await fs.stat(filePath).catch(() => undefined as any);
    const fileMax = Number(process.env.SENTINEL_TAR_FILE_MAX_BYTES || '0');
    if (fileMax > 0 && fileStat?.size && fileStat.size > fileMax) return { findings: [] } as any;
    const globalMax = Number(process.env.SENTINEL_ARCHIVES_GLOBAL_MAX_BYTES || '0');
    const g = globalThis as unknown as { __sentinelArchiveBytes?: number };
    if (g.__sentinelArchiveBytes === undefined) g.__sentinelArchiveBytes = 0;
    const hashMode = (process.env.SENTINEL_CACHE_MODE || 'mtime').toLowerCase() === 'hash';
    const cryptoMod = hashMode ? await import('crypto') : undefined;
    const hasher = cryptoMod ? cryptoMod.createHash('sha256') : undefined;
    let count = 0;
    let totalBytes = 0;
    await new Promise<void>((resolve, reject) => {
      const extract = tar.extract();
      extract.on(
        'entry',
        (
          header: { name: string; type: string; size?: number },
          stream: NodeJS.ReadableStream,
          next: () => void,
        ) => {
          if (count++ >= maxEntries) {
            stream.resume();
            return next();
          }
          if (header.type !== 'file') {
            stream.resume();
            return next();
          }
          if (header.size && header.size > maxEntryBytes) {
            stream.resume();
            return next();
          }
          const parts: Buffer[] = [];
          let entryBytes = 0;
          stream.on('data', (chunk: any) => {
            const b: Buffer = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer);
            entryBytes += b.length;
            if (
              entryBytes <= maxEntryBytes &&
              totalBytes + entryBytes <= maxBytes &&
              (globalMax === 0 ||
                (g.__sentinelArchiveBytes as number) + totalBytes + entryBytes <= globalMax)
            )
              parts.push(b);
          });
          stream.on('end', () => {
            if (entryBytes > maxEntryBytes || totalBytes + entryBytes > maxBytes) {
              return next();
            }
            if (globalMax > 0 && (g.__sentinelArchiveBytes as number) + entryBytes > globalMax) {
              return next();
            }
            totalBytes += entryBytes;
            g.__sentinelArchiveBytes = (g.__sentinelArchiveBytes as number) + entryBytes;
            const content = Buffer.concat(parts).toString('utf8');
            const lines = content.split(/\r?\n/);
            const maxLine = Number(process.env.SENTINEL_TEXT_LINE_MAX_BYTES || '0');
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              if (maxLine > 0 && Buffer.byteLength(line, 'utf8') > maxLine) {
                try {
                  const g = globalThis as any;
                  if (!g.__sentinelMetrics) g.__sentinelMetrics = newMetrics();
                  g.__sentinelMetrics.files_skipped_total++;
                  g.__sentinelMetrics.files_skipped_by_reason['line-too-long'] =
                    (g.__sentinelMetrics.files_skipped_by_reason['line-too-long'] || 0) + 1;
                } catch {}
                continue;
              }
              for (const { s, re } of COMPILED) {
                let m: RegExpExecArray | null;
                re.lastIndex = 0;
                while ((m = re.exec(line)) !== null) {
                  findings.push({
                    filePath: `${filePath}:${header.name}`,
                    line: i + 1,
                    column: m.index + 1,
                    match: m[0],
                    context: line.trim().slice(0, 200),
                    ruleName: s.name,
                    severity: s.severity,
                  });
                }
              }
              // ML hook for archives (best-effort; async without blocking stream)
              const mlSpec = getMlSpec();
              void loadMlHooks(mlSpec)
                .then((hooks) => {
                  if (!hooks.line) return;
                  callMlHook(hooks.line, line, {
                    filePath: `${filePath}:${header.name}`,
                    lineNumber: i + 1,
                  })
                    .then((tokens) => {
                      if (tokens && Array.isArray(tokens)) {
                        try {
                          const g = globalThis as any;
                          if (!g.__sentinelMetrics) g.__sentinelMetrics = newMetrics();
                          g.__sentinelMetrics.ml_findings_total += tokens.length;
                        } catch {}
                        for (const t of tokens) {
                          findings.push({
                            filePath: `${filePath}:${header.name}`,
                            line: i + 1,
                            column: t.index + 1,
                            match: t.token,
                            context: line.trim().slice(0, 200),
                            ruleName: t.ruleName || 'ML-Hook',
                            severity: t.severity || 'medium',
                          });
                        }
                      }
                    })
                    .catch(() => {});
                })
                .catch(() => {});
            }
            next();
          });
          stream.on('error', (_e: unknown) => {
            // skip file on error
            next();
          });
        },
      );
      extract.on('finish', () => resolve());
      extract.on('error', (e: unknown) => reject(e instanceof Error ? e : new Error(String(e))));
      const gunzip = zlib.createGunzip();
      gunzip.on('error', (e: unknown) => reject(e instanceof Error ? e : new Error(String(e))));
      const rs = fsSync.createReadStream(filePath);
      if (hasher) {
        rs.on('data', (chunk: any) => {
          try {
            if (typeof chunk === 'string') {
              hasher.update(Buffer.from(chunk));
            } else {
              hasher.update(chunk as Buffer);
            }
          } catch {}
        });
      }
      rs.on('error', (e: unknown) => reject(e instanceof Error ? e : new Error(String(e))));
      rs.pipe(gunzip).pipe(extract);
    });
    const computedHash = hasher ? hasher.digest('hex') : undefined;
    return { findings, computedHash } as any;
  },
};

export function getScannerPlugins(): ScannerPlugin[] {
  const opt = (process.env.SENTINEL_SCAN_ARCHIVES ?? 'true').toLowerCase();
  const enableZip = !(opt === 'false' || opt === '0' || opt === 'no');
  const arr: ScannerPlugin[] = [];
  if (enableZip) arr.push(zipScanner, tarGzScanner);
  const enableBin = (process.env.SENTINEL_SCAN_BINARIES ?? 'false').toLowerCase();
  if (enableBin === 'true' || enableBin === '1' || enableBin === 'yes') arr.push(binaryScanner);
  arr.push(envScanner, dockerScanner, textScanner);
  return arr;
}
