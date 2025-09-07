import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import JSZip from 'jszip';
import tar from 'tar-stream';
import zlib from 'zlib';
import readline from 'readline';
import { Finding, ScanResult } from '../types.js';
import { loadRules } from '../rules/ruleset.js';
import { findHighEntropyTokens } from '../rules/entropy.js';

export type ScannerPlugin = {
  name: string;
  supports(filePath: string): boolean;
  scan(filePath: string, baseDir?: string): Promise<ScanResult>;
};

type MlToken = { token: string; index: number; ruleName?: string; severity?: 'low'|'medium'|'high' };
type MlHook = (line: string, ctx: { filePath: string; lineNumber: number }) => Promise<MlToken[] | undefined> | MlToken[] | undefined;
let mlHook: MlHook | undefined;
let mlTried = false;
async function getMlHook(): Promise<MlHook | undefined> {
  if (mlTried) return mlHook;
  mlTried = true;
  const spec = (process.env.SENTINEL_ML_HOOK || '').trim();
  if (!spec) return undefined;
  try {
    const toImport = path.isAbsolute(spec) ? pathToFileURL(spec).href : spec;
    const mod: any = await import(toImport);
    const fn: any = mod?.analyzeLine || mod?.default;
    if (typeof fn === 'function') {
      mlHook = fn as MlHook;
    }
  } catch {
    // ignore errors
  }
  return mlHook;
}

async function loadSecretRegexes(baseDir?: string) {
  const rules = await loadRules(baseDir);
  return rules;
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
  return rules.map((s) => {
    try {
      return { s, re: new Ctor(s.re.source, s.re.flags) };
    } catch {
      return { s, re: new RegExp(s.re.source, s.re.flags) };
    }
  });
}

export const textScanner: ScannerPlugin = {
  name: 'text',
  supports: () => true, // fallback for regular files
  async scan(filePath: string, baseDir?: string): Promise<ScanResult> {
  const SECRET_REGEXES = await loadSecretRegexes(baseDir ?? path.dirname(filePath));
  const COMPILED = await compileRuleSet(SECRET_REGEXES);
    const findings: Finding[] = [];
    const hashMode = (process.env.SENTINEL_CACHE_MODE || 'mtime').toLowerCase() === 'hash';
    const hasher = hashMode ? (await import('crypto')).createHash('sha256') : undefined;
    const useEntropy = (process.env.SENTINEL_ENTROPY ?? 'false').toLowerCase();
    const enableEntropy = (useEntropy === 'true' || useEntropy === '1' || useEntropy === 'yes');
    const hook = await getMlHook();
    const maxBytes = Number(process.env.SENTINEL_TEXT_MAX_BYTES || '0'); // 0 = unlimited
    const rs = fsSync.createReadStream(filePath, { encoding: 'utf8' });
    let readBytes = 0;
    let aborted = false;
    if (maxBytes > 0) {
      rs.on('data', (chunk: string | Buffer) => {
        const inc = typeof chunk === 'string' ? Buffer.byteLength(chunk, 'utf8') : chunk.length;
        readBytes += inc;
        if (!aborted && readBytes > maxBytes) { aborted = true; rs.destroy(); }
      });
    }
    const rl = readline.createInterface({ input: rs, crlfDelay: Infinity });
    let lineNo = 0;
    for await (const line of rl) {
      lineNo++;
      if (hasher) hasher.update(line + '\n');
      for (const { s, re } of COMPILED) {
        let m: RegExpExecArray | null;
        re.lastIndex = 0;
        while ((m = re.exec(line)) !== null) {
          findings.push({ filePath, line: lineNo, column: m.index + 1, match: m[0], context: line.trim().slice(0, 200), ruleName: s.name, severity: s.severity });
        }
      }
      if (hook) {
        try {
          const tokens = await hook(line, { filePath, lineNumber: lineNo });
          if (tokens && Array.isArray(tokens)) {
            for (const t of tokens) {
              findings.push({ filePath, line: lineNo, column: t.index + 1, match: t.token, context: line.trim().slice(0, 200), ruleName: t.ruleName || 'ML-Hook', severity: t.severity || 'medium' });
            }
          }
        } catch {}
      }
      if (enableEntropy) {
        const hits = findHighEntropyTokens(line);
        for (const h of hits) {
          findings.push({ filePath, line: lineNo, column: h.index + 1, match: h.token, context: line.trim().slice(0, 200), ruleName: 'High-Entropy Token', severity: 'medium' });
        }
      }
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
  const SECRET_REGEXES = await loadSecretRegexes(baseDir ?? path.dirname(filePath));
    const COMPILED = SECRET_REGEXES.map(s => ({ s, re: new RegExp(s.re.source, s.re.flags) }));
  const findings: Finding[] = [];
  const hashMode = (process.env.SENTINEL_CACHE_MODE || 'mtime').toLowerCase() === 'hash';
  const hasher = hashMode ? await import('crypto').then(m => m.createHash('sha256')) : undefined;
    // built-in regexes
  const useEntropy = (process.env.SENTINEL_ENTROPY ?? 'false').toLowerCase();
  const enableEntropy = (useEntropy === 'true' || useEntropy === '1' || useEntropy === 'yes');
  const hook = await getMlHook();
    const maxBytes = Number(process.env.SENTINEL_TEXT_MAX_BYTES || '0');
    const rs = fsSync.createReadStream(filePath, { encoding: 'utf8' });
    let readBytes = 0;
    let aborted = false;
    if (maxBytes > 0) {
      rs.on('data', (chunk: string | Buffer) => {
        const inc = typeof chunk === 'string' ? Buffer.byteLength(chunk, 'utf8') : chunk.length;
        readBytes += inc;
        if (!aborted && readBytes > maxBytes) { aborted = true; rs.destroy(); }
      });
    }
    const rl = readline.createInterface({ input: rs, crlfDelay: Infinity });
    let lineNo = 0;
    for await (const line of rl) {
  lineNo++;
  if (hasher) hasher.update(line + '\n');
      for (const { s, re } of COMPILED) {
        let m: RegExpExecArray | null;
        re.lastIndex = 0;
        while ((m = re.exec(line)) !== null) {
          findings.push({ filePath, line: lineNo, column: m.index + 1, match: m[0], context: line.trim().slice(0, 200), ruleName: s.name, severity: s.severity });
        }
      }
      // sensitive key heuristics
      const kv = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)\s*$/; // .env format
      const mm = kv.exec(line);
      if (mm && sensitiveKeyRegex().test(mm[1]) && (mm[2].length >= 12)) {
        findings.push({ filePath, line: lineNo, column: line.indexOf(mm[2]) + 1, match: mm[2], context: line.trim().slice(0, 200) });
      }
      if (hook) {
        try {
          const tokens = await hook(line, { filePath, lineNumber: lineNo });
          if (tokens && Array.isArray(tokens)) {
            for (const t of tokens) {
              findings.push({ filePath, line: lineNo, column: t.index + 1, match: t.token, context: line.trim().slice(0, 200), ruleName: t.ruleName || 'ML-Hook', severity: t.severity || 'medium' });
            }
          }
        } catch {}
      }
      if (enableEntropy) {
        const hits = findHighEntropyTokens(line);
        for (const h of hits) {
          findings.push({ filePath, line: lineNo, column: h.index + 1, match: h.token, context: line.trim().slice(0, 200), ruleName: 'High-Entropy Token', severity: 'medium' });
        }
      }
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
  const SECRET_REGEXES = await loadSecretRegexes(baseDir ?? path.dirname(filePath));
  const COMPILED = await compileRuleSet(SECRET_REGEXES);
  const findings: Finding[] = [];
  const hashMode = (process.env.SENTINEL_CACHE_MODE || 'mtime').toLowerCase() === 'hash';
  const hasher = hashMode ? await import('crypto').then(m => m.createHash('sha256')) : undefined;
  const useEntropy = (process.env.SENTINEL_ENTROPY ?? 'false').toLowerCase();
  const enableEntropy = (useEntropy === 'true' || useEntropy === '1' || useEntropy === 'yes');
  const hook = await getMlHook();
    const maxBytes = Number(process.env.SENTINEL_TEXT_MAX_BYTES || '0');
    const rs = fsSync.createReadStream(filePath, { encoding: 'utf8' });
    let readBytes = 0;
    let aborted = false;
    if (maxBytes > 0) {
      rs.on('data', (chunk: string | Buffer) => {
        const inc = typeof chunk === 'string' ? Buffer.byteLength(chunk, 'utf8') : chunk.length;
        readBytes += inc;
        if (!aborted && readBytes > maxBytes) { aborted = true; rs.destroy(); }
      });
    }
    const rl = readline.createInterface({ input: rs, crlfDelay: Infinity });
    let lineNo = 0;
    for await (const line of rl) {
  lineNo++;
  if (hasher) hasher.update(line + '\n');
      for (const { s, re } of COMPILED) {
        let m: RegExpExecArray | null;
        re.lastIndex = 0;
        while ((m = re.exec(line)) !== null) {
          findings.push({ filePath, line: lineNo, column: m.index + 1, match: m[0], context: line.trim().slice(0, 200), ruleName: s.name, severity: s.severity });
        }
      }
      // ENV/ARG key=value
      const mm = /^\s*(ENV|ARG)\s+([A-Za-z_][A-Za-z0-9_]*)=(.+)\s*$/i.exec(line);
      if (mm && sensitiveKeyRegex().test(mm[2]) && (mm[3].length >= 12)) {
        const value = mm[3];
        findings.push({ filePath, line: lineNo, column: line.indexOf(value) + 1, match: value, context: line.trim().slice(0, 200) });
      }
      if (hook) {
        try {
          const tokens = await hook(line, { filePath, lineNumber: lineNo });
          if (tokens && Array.isArray(tokens)) {
            for (const t of tokens) {
              findings.push({ filePath, line: lineNo, column: t.index + 1, match: t.token, context: line.trim().slice(0, 200), ruleName: t.ruleName || 'ML-Hook', severity: t.severity || 'medium' });
            }
          }
        } catch {}
      }
      if (enableEntropy) {
        const hits = findHighEntropyTokens(line);
        for (const h of hits) {
          findings.push({ filePath, line: lineNo, column: h.index + 1, match: h.token, context: line.trim().slice(0, 200), ruleName: 'High-Entropy Token', severity: 'medium' });
        }
      }
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
    const textExts = ['.txt', '.md', '.json', '.yaml', '.yml', '.ts', '.js', '.tsx', '.jsx', '.env', '.dockerfile'];
    const ext = path.extname(l);
    if (!ext) return true;
    return !textExts.includes(ext);
  },
  async scan(filePath: string, baseDir?: string): Promise<ScanResult> {
    const allow = (process.env.SENTINEL_SCAN_BINARIES ?? 'false').toLowerCase();
    if (!(allow === 'true' || allow === '1' || allow === 'yes')) return { findings: [] };
  const SECRET_REGEXES = await loadSecretRegexes(baseDir ?? path.dirname(filePath));
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
        if (c === 0x00) { nonText = sample.length; break; }
      }
      if (nonText / sample.length > 0.3) return { findings: [] };
      // Naive decode: try utf8; for failures, replace invalids
      const text = buf.toString('utf8');
      const findings: Finding[] = [];
      const lines = text.split(/\r?\n/);
      const COMPILED = await compileRuleSet(SECRET_REGEXES);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const { s, re } of COMPILED) {
          let m: RegExpExecArray | null;
          while ((m = re.exec(line)) !== null) {
            findings.push({ filePath, line: i + 1, column: m.index + 1, match: m[0], context: line.trim().slice(0, 200), ruleName: s.name, severity: s.severity });
          }
        }
      }
      const hashMode = (process.env.SENTINEL_CACHE_MODE || 'mtime').toLowerCase() === 'hash';
      const computedHash = hashMode ? (await import('crypto')).createHash('sha256').update(buf).digest('hex') : undefined;
      return { findings, computedHash };
    } catch {
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
    if (allowArchives === 'false' || allowArchives === '0' || allowArchives === 'no') return { findings: [] };
  const fileStat = await fs.stat(filePath).catch(() => undefined as any);
  const fileMax = Number(process.env.SENTINEL_ZIP_FILE_MAX_BYTES || '0');
    if (fileMax > 0 && fileStat?.size && fileStat.size > fileMax) return { findings: [] };
    const buf = await fs.readFile(filePath);
    const hashMode = (process.env.SENTINEL_CACHE_MODE || 'mtime').toLowerCase() === 'hash';
    const computedHash = hashMode ? (await import('crypto')).createHash('sha256').update(buf).digest('hex') : undefined;
    const zip = await JSZip.loadAsync(buf);
  const SECRET_REGEXES = await loadSecretRegexes(baseDir ?? path.dirname(filePath));
  const COMPILED = await compileRuleSet(SECRET_REGEXES);
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
  const hook = await getMlHook();
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
  if (globalMax > 0 && (g.__sentinelArchiveBytes + bytes > globalMax)) break;
  totalBytes += bytes;
  g.__sentinelArchiveBytes += bytes;
      const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
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
        if (hook) {
          try {
            const tokens = await hook(line, { filePath: `${filePath}:${entry.name}`, lineNumber: i + 1 });
            if (tokens && Array.isArray(tokens)) {
              for (const t of tokens) {
                findings.push({ filePath: `${filePath}:${entry.name}`, line: i + 1, column: t.index + 1, match: t.token, context: line.trim().slice(0, 200), ruleName: t.ruleName || 'ML-Hook', severity: t.severity || 'medium' });
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
    if (allowArchives === 'false' || allowArchives === '0' || allowArchives === 'no') return { findings: [] } as any;
    const SECRET_REGEXES = await loadSecretRegexes(baseDir ?? path.dirname(filePath));
    const COMPILED = await compileRuleSet(SECRET_REGEXES);
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
      extract.on('entry', (header: { name: string; type: string; size?: number }, stream: NodeJS.ReadableStream, next: () => void) => {
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
          if (entryBytes <= maxEntryBytes && totalBytes + entryBytes <= maxBytes && (globalMax === 0 || (g.__sentinelArchiveBytes as number) + totalBytes + entryBytes <= globalMax)) parts.push(b);
        });
        stream.on('end', () => {
          if (entryBytes > maxEntryBytes || totalBytes + entryBytes > maxBytes) {
            return next();
          }
          if (globalMax > 0 && ((g.__sentinelArchiveBytes as number) + entryBytes > globalMax)) {
            return next();
          }
          totalBytes += entryBytes;
          g.__sentinelArchiveBytes = (g.__sentinelArchiveBytes as number) + entryBytes;
          const content = Buffer.concat(parts).toString('utf8');
          const lines = content.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
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
            // ML hook for archives
            // Note: getMlHook() returns cached hook once loaded
            void getMlHook().then((hook) => {
              if (!hook) return;
              Promise.resolve(hook(line, { filePath: `${filePath}:${header.name}`, lineNumber: i + 1 }))
                .then((tokens) => {
                  if (tokens && Array.isArray(tokens)) {
                    for (const t of tokens) {
                      findings.push({ filePath: `${filePath}:${header.name}`, line: i + 1, column: t.index + 1, match: t.token, context: line.trim().slice(0, 200), ruleName: t.ruleName || 'ML-Hook', severity: t.severity || 'medium' });
                    }
                  }
                })
                .catch(() => {});
            });
          }
          next();
        });
        stream.on('error', (_e: unknown) => {
          // skip file on error
          next();
        });
      });
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
  const enableBin = ((process.env.SENTINEL_SCAN_BINARIES ?? 'false').toLowerCase());
  if (enableBin === 'true' || enableBin === '1' || enableBin === 'yes') arr.push(binaryScanner);
  arr.push(envScanner, dockerScanner, textScanner);
  return arr;
}
