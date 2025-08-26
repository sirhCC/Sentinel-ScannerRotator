import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import JSZip from 'jszip';
import tar from 'tar-stream';
import zlib from 'zlib';
import { Finding } from '../types.js';
import { loadRules } from '../rules/ruleset.js';
import { findHighEntropyTokens } from '../rules/entropy.js';

export type ScannerPlugin = {
  name: string;
  supports(filePath: string): boolean;
  scan(filePath: string, baseDir?: string): Promise<Finding[]>;
};

async function loadSecretRegexes(baseDir?: string) {
  const rules = await loadRules(baseDir);
  return rules;
}

export const textScanner: ScannerPlugin = {
  name: 'text',
  supports: () => true, // fallback for regular files
  async scan(filePath: string, baseDir?: string): Promise<Finding[]> {
  const SECRET_REGEXES = await loadSecretRegexes(baseDir ?? path.dirname(filePath));
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const findings: Finding[] = [];
  const useEntropy = (process.env.SENTINEL_ENTROPY ?? 'false').toLowerCase();
  const enableEntropy = (useEntropy === 'true' || useEntropy === '1' || useEntropy === 'yes');
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
            ruleName: s.name,
            severity: s.severity,
          });
        }
      }
      if (enableEntropy) {
        const hits = findHighEntropyTokens(line);
        for (const h of hits) {
          findings.push({
            filePath,
            line: i + 1,
            column: h.index + 1,
            match: h.token,
            context: line.trim().slice(0, 200),
            ruleName: 'High-Entropy Token',
            severity: 'medium',
          });
        }
      }
    }
    return findings;
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
  async scan(filePath: string, baseDir?: string): Promise<Finding[]> {
  const SECRET_REGEXES = await loadSecretRegexes(baseDir ?? path.dirname(filePath));
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const findings: Finding[] = [];
    // built-in regexes
  const useEntropy = (process.env.SENTINEL_ENTROPY ?? 'false').toLowerCase();
  const enableEntropy = (useEntropy === 'true' || useEntropy === '1' || useEntropy === 'yes');
  for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const s of SECRET_REGEXES) {
        let m: RegExpExecArray | null;
        const re = new RegExp(s.re.source, s.re.flags);
        while ((m = re.exec(line)) !== null) {
          findings.push({ filePath, line: i + 1, column: m.index + 1, match: m[0], context: line.trim().slice(0, 200), ruleName: s.name, severity: s.severity });
        }
      }
      // sensitive key heuristics
      const kv = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)\s*$/; // .env format
      const mm = kv.exec(line);
      if (mm && sensitiveKeyRegex().test(mm[1]) && (mm[2].length >= 12)) {
        findings.push({ filePath, line: i + 1, column: line.indexOf(mm[2]) + 1, match: mm[2], context: line.trim().slice(0, 200) });
      }
      if (enableEntropy) {
        const hits = findHighEntropyTokens(line);
        for (const h of hits) {
          findings.push({ filePath, line: i + 1, column: h.index + 1, match: h.token, context: line.trim().slice(0, 200), ruleName: 'High-Entropy Token', severity: 'medium' });
        }
      }
    }
    return findings;
  },
};

export const dockerScanner: ScannerPlugin = {
  name: 'dockerfile',
  supports(filePath: string) {
    const b = path.basename(filePath);
    const l = b.toLowerCase();
    return b === 'Dockerfile' || l.startsWith('dockerfile.') || l.endsWith('.dockerfile');
  },
  async scan(filePath: string, baseDir?: string): Promise<Finding[]> {
    const SECRET_REGEXES = await loadSecretRegexes(baseDir ?? path.dirname(filePath));
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const findings: Finding[] = [];
  const useEntropy = (process.env.SENTINEL_ENTROPY ?? 'false').toLowerCase();
  const enableEntropy = (useEntropy === 'true' || useEntropy === '1' || useEntropy === 'yes');
  for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const s of SECRET_REGEXES) {
        let m: RegExpExecArray | null;
        const re = new RegExp(s.re.source, s.re.flags);
        while ((m = re.exec(line)) !== null) {
          findings.push({ filePath, line: i + 1, column: m.index + 1, match: m[0], context: line.trim().slice(0, 200), ruleName: s.name, severity: s.severity });
        }
      }
      // ENV/ARG key=value
      const mm = /^\s*(ENV|ARG)\s+([A-Za-z_][A-Za-z0-9_]*)=(.+)\s*$/i.exec(line);
      if (mm && sensitiveKeyRegex().test(mm[2]) && (mm[3].length >= 12)) {
        const value = mm[3];
        findings.push({ filePath, line: i + 1, column: line.indexOf(value) + 1, match: value, context: line.trim().slice(0, 200) });
      }
      if (enableEntropy) {
        const hits = findHighEntropyTokens(line);
        for (const h of hits) {
          findings.push({ filePath, line: i + 1, column: h.index + 1, match: h.token, context: line.trim().slice(0, 200), ruleName: 'High-Entropy Token', severity: 'medium' });
        }
      }
    }
    return findings;
  },
};

export const zipScanner: ScannerPlugin = {
  name: 'zip',
  supports(filePath: string) {
    return filePath.toLowerCase().endsWith('.zip');
  },
  async scan(filePath: string, baseDir?: string): Promise<Finding[]> {
    const allowArchives = (process.env.SENTINEL_SCAN_ARCHIVES ?? 'true').toLowerCase();
    if (allowArchives === 'false' || allowArchives === '0' || allowArchives === 'no') return [];
    const buf = await fs.readFile(filePath);
    const zip = await JSZip.loadAsync(buf);
    const SECRET_REGEXES = await loadSecretRegexes(baseDir ?? path.dirname(filePath));
    const findings: Finding[] = [];
    const maxEntries = Number(process.env.SENTINEL_ZIP_MAX_ENTRIES || '1000');
    const maxEntryBytes = Number(process.env.SENTINEL_ZIP_MAX_ENTRY_BYTES || '1048576'); // 1 MiB
    const maxBytes = Number(process.env.SENTINEL_ZIP_MAX_BYTES || '10485760'); // 10 MiB
    let count = 0;
    let totalBytes = 0;
    type ZipEntry = { dir?: boolean; name: string; async: (t: 'string') => Promise<string> };
    const entries = Object.values(zip.files) as unknown as ZipEntry[];
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
      totalBytes += bytes;
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
    for (const s of SECRET_REGEXES) {
          let m: RegExpExecArray | null;
          const re = new RegExp(s.re.source, s.re.flags);
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
      }
    }
    return findings;
  },
};

export const tarGzScanner: ScannerPlugin = {
  name: 'targz',
  supports(filePath: string) {
    const l = filePath.toLowerCase();
    return l.endsWith('.tar.gz') || l.endsWith('.tgz');
  },
  async scan(filePath: string, baseDir?: string): Promise<Finding[]> {
    const allowArchives = (process.env.SENTINEL_SCAN_ARCHIVES ?? 'true').toLowerCase();
    if (allowArchives === 'false' || allowArchives === '0' || allowArchives === 'no') return [];
  const SECRET_REGEXES = await loadSecretRegexes(baseDir ?? path.dirname(filePath));
    const findings: Finding[] = [];
    const maxEntries = Number(process.env.SENTINEL_TAR_MAX_ENTRIES || '1000');
    const maxEntryBytes = Number(process.env.SENTINEL_TAR_MAX_ENTRY_BYTES || '1048576'); // 1 MiB
    const maxBytes = Number(process.env.SENTINEL_TAR_MAX_BYTES || '10485760'); // 10 MiB
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
        stream.on('data', (chunk: Buffer) => {
          entryBytes += chunk.length;
          if (entryBytes <= maxEntryBytes && totalBytes + entryBytes <= maxBytes) parts.push(chunk);
        });
        stream.on('end', () => {
          if (entryBytes > maxEntryBytes || totalBytes + entryBytes > maxBytes) {
            return next();
          }
          totalBytes += entryBytes;
          const content = Buffer.concat(parts).toString('utf8');
          const lines = content.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
    for (const s of SECRET_REGEXES) {
              let m: RegExpExecArray | null;
              const re = new RegExp(s.re.source, s.re.flags);
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
      rs.on('error', (e: unknown) => reject(e instanceof Error ? e : new Error(String(e))));
      rs.pipe(gunzip).pipe(extract);
    });
    return findings;
  },
};

export function getScannerPlugins(): ScannerPlugin[] {
  const opt = (process.env.SENTINEL_SCAN_ARCHIVES ?? 'true').toLowerCase();
  const enableZip = !(opt === 'false' || opt === '0' || opt === 'no');
  const arr: ScannerPlugin[] = [];
  if (enableZip) arr.push(zipScanner, tarGzScanner);
  arr.push(envScanner, dockerScanner, textScanner);
  return arr;
}
