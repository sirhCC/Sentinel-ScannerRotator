import { describe, it, expect } from 'vitest';
import { runCli } from '../src/index';
import fs from 'fs';
import path from 'path';

describe('cli --min-severity', () => {
  it('overrides policy minSeverity', async () => {
    const repo = 'tmp-cli-minsev';
    try {
      fs.mkdirSync(repo);
    } catch {}
    const f = path.join(repo, 's.txt');
    // One low (JWT-like) and one high (AKIA...)
    fs.writeFileSync(f, 'eyJlow.low.low\nAKIAABCDEFGHIJKLMNOP');
    // Policy sets minSeverity to high (so only 1 considered). CLI sets medium -> both considered -> threshold 0 fails with 2
    const policy = { policy: { minSeverity: 'high', thresholds: { total: 0 } } };
    fs.writeFileSync(path.join(repo, '.secretsentinel.json'), JSON.stringify(policy));
    const code = await runCli([
      repo,
      '--rotator',
      'dry-run',
      '--fail-on-findings',
      '--min-severity',
      'medium',
    ]);
    try {
      fs.rmSync(repo, { recursive: true, force: true });
    } catch {}
    expect(code).toBe(4);
  });
});
