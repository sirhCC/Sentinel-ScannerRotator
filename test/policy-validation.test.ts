import { describe, it, expect } from 'vitest';
import { loadPolicy } from '../src/policy';
import fs from 'fs';
import path from 'path';

describe('policy validation', () => {
  it('rejects negative threshold values', async () => {
    const tmp = 'tmp-policy-negative';
    try {
      fs.mkdirSync(tmp);
    } catch {}
    const configPath = path.join(tmp, '.secretsentinel.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        policy: {
          thresholds: { total: -5 },
        },
      }),
    );

    try {
      await loadPolicy(tmp);
      expect.fail('Should have thrown validation error');
    } catch (err: any) {
      expect(err.message).toContain('Invalid policy configuration');
    } finally {
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {}
    }
  });

  it('rejects non-integer threshold values', async () => {
    const tmp = 'tmp-policy-float';
    try {
      fs.mkdirSync(tmp);
    } catch {}
    const configPath = path.join(tmp, '.secretsentinel.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        policy: {
          thresholds: { high: 1.5 },
        },
      }),
    );

    try {
      await loadPolicy(tmp);
      expect.fail('Should have thrown validation error');
    } catch (err: any) {
      expect(err.message).toContain('Invalid policy configuration');
    } finally {
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {}
    }
  });

  it('rejects invalid minSeverity values', async () => {
    const tmp = 'tmp-policy-severity';
    try {
      fs.mkdirSync(tmp);
    } catch {}
    const configPath = path.join(tmp, '.secretsentinel.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        policy: {
          minSeverity: 'critical',
        },
      }),
    );

    try {
      await loadPolicy(tmp);
      expect.fail('Should have thrown validation error');
    } catch (err: any) {
      expect(err.message).toContain('Invalid');
    } finally {
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {}
    }
  });

  it('rejects empty strings in forbidRules', async () => {
    const tmp = 'tmp-policy-empty-rule';
    try {
      fs.mkdirSync(tmp);
    } catch {}
    const configPath = path.join(tmp, '.secretsentinel.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        policy: {
          forbidRules: ['AWS Access Key ID', ''],
        },
      }),
    );

    try {
      await loadPolicy(tmp);
      expect.fail('Should have thrown validation error');
    } catch (err: any) {
      expect(err.message).toContain('Invalid policy configuration');
    } finally {
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {}
    }
  });

  it('accepts valid policy configuration', async () => {
    const tmp = 'tmp-policy-valid';
    try {
      fs.mkdirSync(tmp);
    } catch {}
    const configPath = path.join(tmp, '.secretsentinel.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        policy: {
          thresholds: { total: 0, high: 0, medium: 5, low: 10 },
          forbidRules: ['AWS Access Key ID', 'Generic API Key'],
          minSeverity: 'medium',
        },
      }),
    );

    try {
      const policy = await loadPolicy(tmp);
      expect(policy).toBeDefined();
      expect(policy?.thresholds?.total).toBe(0);
      expect(policy?.thresholds?.medium).toBe(5);
      expect(policy?.forbidRules).toHaveLength(2);
      expect(policy?.minSeverity).toBe('medium');
    } finally {
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {}
    }
  });

  it('accepts policy with only some fields', async () => {
    const tmp = 'tmp-policy-partial';
    try {
      fs.mkdirSync(tmp);
    } catch {}
    const configPath = path.join(tmp, '.secretsentinel.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        policy: {
          forbidRules: ['AWS Access Key ID'],
        },
      }),
    );

    try {
      const policy = await loadPolicy(tmp);
      expect(policy).toBeDefined();
      expect(policy?.forbidRules).toHaveLength(1);
      expect(policy?.thresholds).toBeUndefined();
      expect(policy?.minSeverity).toBeUndefined();
    } finally {
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {}
    }
  });
});
