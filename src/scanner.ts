import fs from "fs/promises";
import path from "path";
import { Finding } from "./types";
import { loadIgnorePatterns } from "./ignore";
import { loadPatterns } from "./config";

async function loadSecretRegexes() {
  const defs = await loadPatterns();
  if (defs.length > 0) {
    return defs.map((d) => ({ name: d.name, re: new RegExp(d.regex, 'g') }));
  }
  return [
    { name: "AWS Access Key ID", re: /AKIA[0-9A-Z]{16}/g },
    { name: "Generic API Key", re: /(?:api_key|apikey|api-key)\s*[:=]\s*['\"]?([A-Za-z0-9-_]{16,})/gi },
    { name: "JWT-Like", re: /eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g },
  ];
}

export async function scanPath(targetPath: string): Promise<Finding[]> {
  const stats = await fs.stat(targetPath);
  if (stats.isFile()) return scanFile(targetPath);

  const ig = await loadIgnorePatterns(targetPath);
  const SECRET_REGEXES = await loadSecretRegexes();
  const results: Finding[] = [];
  await walkDir(targetPath, ig, results);
  return results;
}

async function walkDir(dir: string, ig: import('ignore').Ignore, results: Finding[]) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = path.relative(process.cwd(), full);
    if (ig.ignores(rel)) continue;
    if (e.isDirectory()) {
      await walkDir(full, ig, results);
    } else if (e.isFile()) {
      try {
  const r = await scanFile(full);
        results.push(...r);
      } catch (e) {
        // ignore read errors
      }
    }
  }
}

export async function scanFile(filePath: string): Promise<Finding[]> {
  const SECRET_REGEXES = await loadSecretRegexes();
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
