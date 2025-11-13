import { describe, it, expect } from 'vitest';
import { loadPatterns } from '../src/config';
import fs from 'fs';
import path from 'path';

describe('config validation', () => {
  it('rejects invalid regex patterns', async () => {
    const tmp = 'tmp-config-invalid-regex';
    try { fs.mkdirSync(tmp); } catch {}
    const configPath = path.join(tmp, '.secretsentinel.json');
    fs.writeFileSync(configPath, JSON.stringify({
      patterns: [
        { name: 'Bad Pattern', regex: '[invalid(regex' }
      ]
    }));

    try {
      await loadPatterns(tmp);
      expect.fail('Should have thrown validation error');
    } catch (err: any) {
      expect(err.message).toContain('Invalid regex pattern');
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    }
  });

  it('rejects empty pattern names', async () => {
    const tmp = 'tmp-config-empty-name';
    try { fs.mkdirSync(tmp); } catch {}
    const configPath = path.join(tmp, '.secretsentinel.json');
    fs.writeFileSync(configPath, JSON.stringify({
      patterns: [
        { name: '', regex: 'test.*' }
      ]
    }));

    try {
      await loadPatterns(tmp);
      expect.fail('Should have thrown validation error');
    } catch (err: any) {
      expect(err.message).toContain('Pattern name cannot be empty');
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    }
  });

  it('rejects invalid severity values', async () => {
    const tmp = 'tmp-config-invalid-severity';
    try { fs.mkdirSync(tmp); } catch {}
    const configPath = path.join(tmp, '.secretsentinel.json');
    fs.writeFileSync(configPath, JSON.stringify({
      patterns: [
        { name: 'Test', regex: 'test.*', severity: 'critical' }
      ]
    }));

    try {
      await loadPatterns(tmp);
      expect.fail('Should have thrown validation error');
    } catch (err: any) {
      expect(err.message).toContain('Invalid');
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    }
  });

  it('accepts valid pattern configuration', async () => {
    const tmp = 'tmp-config-valid';
    try { fs.mkdirSync(tmp); } catch {}
    const configPath = path.join(tmp, '.secretsentinel.json');
    fs.writeFileSync(configPath, JSON.stringify({
      patterns: [
        { name: 'Test Pattern', regex: 'TEST_[A-Z0-9]{8}', severity: 'high', enabled: true }
      ]
    }));

    try {
      const patterns = await loadPatterns(tmp);
      expect(patterns).toHaveLength(1);
      expect(patterns[0].name).toBe('Test Pattern');
      expect(patterns[0].severity).toBe('high');
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    }
  });
});
