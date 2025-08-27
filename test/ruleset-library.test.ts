import { describe, it, expect } from 'vitest';
import { listRulesets, loadSelectedRules } from '../src/rules/library';

describe('ruleset library', () => {
  it('lists built-in rulesets', async () => {
    const names = await listRulesets();
    expect(names).toContain('common');
    expect(names).toContain('cloud');
  });

  it('loads selected curated rules when SENTINEL_RULESETS is set', async () => {
    const prev = process.env.SENTINEL_RULESETS;
    process.env.SENTINEL_RULESETS = 'common';
    const rules = await loadSelectedRules();
    expect(rules.length).toBeGreaterThan(0);
    // sanity check: one of the curated names
    expect(rules.find((r) => r.name.includes('GitHub Token'))).toBeTruthy();
    process.env.SENTINEL_RULESETS = prev;
  });
});
