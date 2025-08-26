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

export const zipScanner: ScannerPlugin = {
  name: 'zip',
  supports(filePath: string) {
    return filePath.toLowerCase().endsWith('.zip');
  },
  async scan(filePath: string, baseDir?: string): Promise<Finding[]> {
    const buf = await fs.readFile(filePath);
    const zip = await JSZip.loadAsync(buf);
    const SECRET_REGEXES = await loadSecretRegexes(baseDir ?? path.dirname(filePath));
    const findings: Finding[] = [];
    const maxEntries = Number(process.env.SENTINEL_ZIP_MAX_ENTRIES || '1000');
    let count = 0;
    const entries = Object.values(zip.files) as any[];
    for (const entry of entries) {
      if (count++ >= maxEntries) break;
      if ((entry as any).dir) continue;
      // Only attempt to parse as text (utf8) for now
      let content: string;
      try {
        content = await (entry as any).async('string');
      } catch {
        continue;
      }
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const s of SECRET_REGEXES) {
          let m: RegExpExecArray | null;
          const re = new RegExp(s.re.source, s.re.flags);
          while ((m = re.exec(line)) !== null) {
            findings.push({
              filePath: `${filePath}:${(entry as any).name}`,
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
  return [zipScanner, textScanner]; // order matters; zip first, then fallback to text
}
