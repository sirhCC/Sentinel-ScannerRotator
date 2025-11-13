import { describe, it, expect } from 'vitest';
import { runCli } from '../src/index';
import fs from 'fs';
import path from 'path';

// Minimal tests to validate minSeverity filtering and thresholds precedence.
describe('policy semantics', () => {
  it('applies minSeverity filter before thresholds', async () => {
    const repo = 'tmp-policy-minsev';
    try {
      fs.mkdirSync(repo);
    } catch {}
    const f = path.join(repo, 's.txt');
    fs.writeFileSync(
      f,
      'low JWT eyJ.aa.bb\nmedium apikey=ABCDEFGHIJKLMNOP\nhigh AKIAABCDEFGHIJKLMNOP',
    );
    // Policy: minSeverity=high and thresholds total=0; only high should count => 1 > 0 -> fail
    const policy = { policy: { minSeverity: 'high', thresholds: { total: 0 } } };
    fs.writeFileSync(path.join(repo, '.secretsentinel.json'), JSON.stringify(policy));
    const code = await runCli([repo, '--rotator', 'dry-run', '--fail-on-findings']);
    try {
      fs.rmSync(repo, { recursive: true, force: true });
    } catch {}
    expect(code).toBe(4);
  });

  it('respects CLI threshold over policy', async () => {
    const repo = 'tmp-policy-cli-precedence';
    try {
      fs.mkdirSync(repo);
    } catch {}
    const f = path.join(repo, 's.txt');
    // 2 medium findings
    fs.writeFileSync(f, 'apikey=ABCDEFGHIJKLMNOP\napikey=ABCDEFGHIJKLMNOP');
    // Policy allows up to 5 total
    const policy = { policy: { thresholds: { total: 5 } } };
    fs.writeFileSync(path.join(repo, '.secretsentinel.json'), JSON.stringify(policy));
    // CLI overrides with fail-threshold=1 -> should fail (2 > 1)
    const code = await runCli([
      repo,
      '--rotator',
      'dry-run',
      '--fail-on-findings',
      '--fail-threshold',
      '1',
    ]);
    try {
      fs.rmSync(repo, { recursive: true, force: true });
    } catch {}
    expect(code).toBe(4);
  });
});
