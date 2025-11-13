import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

describe('ruleset marketplace (local catalog)', () => {
  it('installs ruleset from a file catalog and loads it', async () => {
    const { installRulesets } = await import('../src/rules/marketplace');
    const { listRulesets, loadSelectedRules } = await import('../src/rules/library');

    const work = 'tmp-market';
    const cache = path.join(work, 'cache');
    try {
      fs.mkdirSync(work);
    } catch {}
    try {
      fs.mkdirSync(cache);
    } catch {}

    const rs = [{ name: 'CAT_RULE', regex: 'CATA_[0-9]{4}', severity: 'low' }];
    const rsPath = path.join(work, 'cat.ruleset.json');
    fs.writeFileSync(rsPath, JSON.stringify({ name: 'cat', rules: rs }, null, 2));
    const buf = fs.readFileSync(rsPath);
    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');

    const catalog = { rulesets: [{ name: 'cat', url: rsPath, sha256 }] };
    const catPath = path.join(work, 'catalog.json');
    fs.writeFileSync(catPath, JSON.stringify(catalog, null, 2));

    const { installed, dir } = await installRulesets({
      catalog: catPath,
      names: ['cat'],
      cacheDir: cache,
    });
    expect(installed).toContain('cat');
    expect(fs.existsSync(path.join(dir, 'cat.ruleset.json'))).toBe(true);

    // Listing should include the newly installed ruleset when pointing at cache dir
    const names = await listRulesets([cache]);
    expect(names).toContain('cat');

    // Load selected curated rules from cache via env
    process.env.SENTINEL_RULESETS = 'cat';
    process.env.SENTINEL_RULESETS_DIRS = cache;
    const rules = await loadSelectedRules();
    expect(rules.find((r: any) => r.name === 'CAT_RULE')).toBeTruthy();

    try {
      fs.rmSync(work, { recursive: true, force: true });
    } catch {}
  });
});
