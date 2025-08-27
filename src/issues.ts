import fs from 'fs/promises';
import path from 'path';

export type Issue = {
  ts: number;
  file: string;
  line: number;
  column: number;
  match: string;
  severity?: 'low'|'medium'|'high';
  rule?: string;
  reason: string;
};

export type IssuesOptions = {
  provider?: string; // 'file' default
  filePath?: string; // for file provider
  minSeverity?: 'low'|'medium'|'high';
};

function sevRank(s?: 'low'|'medium'|'high') {
  const r = { low: 1, medium: 2, high: 3 } as const;
  return s ? r[s] : r.medium;
}

async function ensureDir(p: string) {
  try { await fs.mkdir(p, { recursive: true }); } catch {}
}

async function fileProviderWrite(filePath: string, issues: Issue[]) {
  await ensureDir(path.dirname(filePath));
  const lines = issues.map(i => JSON.stringify(i) + '\n').join('');
  await fs.appendFile(filePath, lines, 'utf8');
}

export async function createIssues(findings: Array<{ filePath: string; line: number; column: number; match: string; severity?: 'low'|'medium'|'high'; ruleName?: string }>, opts?: IssuesOptions) {
  const provider = (opts?.provider || process.env.SENTINEL_ISSUES_PROVIDER || 'file').toLowerCase();
  const minSevStr = (opts?.minSeverity || (process.env.SENTINEL_ISSUES_MIN_SEVERITY as any) || 'high') as 'low'|'medium'|'high';
  const minRank = sevRank(minSevStr);
  const filtered = findings.filter(f => sevRank((f.severity || 'medium') as any) >= minRank);
  if (!filtered.length) return { created: 0 };
  if (provider === 'file') {
    const filePath = opts?.filePath || process.env.SENTINEL_ISSUES_FILE || path.join(process.cwd(), '.sentinel_issues.ndjson');
    const issues: Issue[] = filtered.map(f => ({ ts: Date.now(), file: f.filePath, line: f.line, column: f.column, match: f.match, severity: f.severity, rule: f.ruleName, reason: 'Policy threshold exceeded' }));
    await fileProviderWrite(filePath, issues);
    return { created: issues.length, provider: 'file', path: filePath };
  }
  // Other providers could be added later (github, jira)
  return { created: 0 };
}
