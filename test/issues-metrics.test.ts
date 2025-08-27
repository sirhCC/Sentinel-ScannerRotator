import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { runCli } from '../src/index';

describe('issues and metrics', () => {
  it('writes metrics file at end of run', async () => {
    const repo = 'tmp-metrics';
    try { fs.mkdirSync(repo); } catch {}
    fs.writeFileSync(path.join(repo, 'a.txt'), 'AKIAABCDEFGHIJKLMNOP');
    const prom = path.join(repo, 'metrics.prom');
    const code = await runCli([repo, '--rotator', 'dry-run', '--metrics', prom]);
    expect(code).toBe(0);
    const content = fs.readFileSync(prom, 'utf8');
    expect(content).toMatch(/sentinel_findings_total/);
    try { fs.rmSync(repo, { recursive: true, force: true }); } catch {}
  });

  it('creates issues file when failing on findings', async () => {
    const repo = 'tmp-issues';
    try { fs.mkdirSync(repo); } catch {}
    fs.writeFileSync(path.join(repo, 'b.txt'), 'AKIAABCDEFGHIJKLMNOP');
    const issues = path.join(repo, 'issues.ndjson');
    const code = await runCli([repo, '--rotator', 'dry-run', '--fail-on-findings', '--issues', '--issues-file', issues]);
    expect(code).toBe(4);
    const content = fs.readFileSync(issues, 'utf8');
    expect(content.split(/\n/).filter(Boolean).length).toBeGreaterThan(0);
    try { fs.rmSync(repo, { recursive: true, force: true }); } catch {}
  });
});
