import { describe, it, expect } from 'vitest';

describe('cli --show-runtime-info', () => {
  it('prints runtime info and exits 0 (text)', async () => {
    const { runCli } = await import('../src/index');
    let out = '';
    const origLog = console.log;
    try {
      console.log = (...args: any[]) => { out += args.join(' ') + '\n'; };
      const code = await runCli(['--show-runtime-info']);
      expect(code).toBe(0);
      expect(out).toMatch(/Engine:/);
    } finally {
      console.log = origLog;
    }
  });
  it('prints runtime info as JSON with --log-json', async () => {
    const { runCli } = await import('../src/index');
    let out = '';
    const origLog = console.log;
    try {
      console.log = (...args: any[]) => { out += args.join(' '); };
      const code = await runCli(['--show-runtime-info', '--log-json']);
      expect(code).toBe(0);
      const obj = JSON.parse(out);
      expect(obj.runtime).toBeDefined();
      expect(obj.runtime.engine).toBeDefined();
    } finally {
      console.log = origLog;
    }
  });
});
