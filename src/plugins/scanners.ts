import fs from 'fs/promises';
import path from 'path';
import JSZip from 'jszip';
import { Finding } from '../types.js';
import { loadPatterns } from '../config.js';

export type ScannerPlugin = {
  name: string;
  supports(filePath: string): boolean;
  scan(filePath: string, baseDir?: string): Promise<Finding[]>;
};

async function loadSecretRegexes(baseDir?: string) {
  const defs = await loadPatterns(baseDir);
  const builtins = [
    { name: 'AWS Access Key ID', re: /AKIA[0-9A-Z]{16}/g },
    { name: 'Generic API Key', re: /(?:api_key|apikey|api-key)\s*[:=]\s*['\"]?([A-Za-z0-9-_]{16,})/gi },
    { name: 'JWT-Like', re: /eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g },
  ];
  if (defs.length === 0) return builtins;
  const custom = defs.map((d) => ({ name: d.name, re: new RegExp(d.regex, 'g') }));
  return builtins.concat(custom);
}

export const textScanner: ScannerPlugin = {
  name: 'text',
  supports: () => true, // fallback for regular files
  async scan(filePath: string, baseDir?: string): Promise<Finding[]> {
    const SECRET_REGEXES = await loadSecretRegexes(baseDir ?? path.dirname(filePath));
    const content = await fs.readFile(filePath, 'utf8');
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
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const s of SECRET_REGEXES) {
        let m: RegExpExecArray | null;
        const re = new RegExp(s.re.source, s.re.flags);
        while ((m = re.exec(line)) !== null) {
          findings.push({ filePath, line: i + 1, column: m.index + 1, match: m[0], context: line.trim().slice(0, 200) });
        }
      }
      // sensitive key heuristics
      const kv = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)\s*$/; // .env format
      const mm = kv.exec(line);
      if (mm && sensitiveKeyRegex().test(mm[1]) && (mm[2].length >= 12)) {
        findings.push({ filePath, line: i + 1, column: line.indexOf(mm[2]) + 1, match: mm[2], context: line.trim().slice(0, 200) });
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
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const s of SECRET_REGEXES) {
        let m: RegExpExecArray | null;
        const re = new RegExp(s.re.source, s.re.flags);
        while ((m = re.exec(line)) !== null) {
          findings.push({ filePath, line: i + 1, column: m.index + 1, match: m[0], context: line.trim().slice(0, 200) });
        }
      }
      // ENV/ARG key=value
      const mm = /^\s*(ENV|ARG)\s+([A-Za-z_][A-Za-z0-9_]*)=(.+)\s*$/i.exec(line);
      if (mm && sensitiveKeyRegex().test(mm[2]) && (mm[3].length >= 12)) {
        const value = mm[3];
        findings.push({ filePath, line: i + 1, column: line.indexOf(value) + 1, match: value, context: line.trim().slice(0, 200) });
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
            });
          }
        }
      }
    }
    return findings;
  },
};

export function getScannerPlugins(): ScannerPlugin[] {
  const opt = (process.env.SENTINEL_SCAN_ARCHIVES ?? 'true').toLowerCase();
  const enableZip = !(opt === 'false' || opt === '0' || opt === 'no');
  const arr: ScannerPlugin[] = [];
  if (enableZip) arr.push(zipScanner);
  arr.push(envScanner, dockerScanner, textScanner);
  return arr;
}
