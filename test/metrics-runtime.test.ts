import { describe, it, expect } from 'vitest';

describe('metrics runtime info', () => {
  it('exposes sentinel_runtime_info with labels', async () => {
    const { newMetrics } = await import('../src/metrics');
    const { startMetricsServer } = await import('../src/server');
    const m = newMetrics();
    m.runtime_info = {
      engine: 'native',
      workers: 3,
      cacheMode: 'mtime',
      scanConcurrency: 8,
      rotateConcurrency: 4,
      version: '0.0.0-test',
    };
    const srv = await startMetricsServer(m, { port: 0 });
    const base = `http://127.0.0.1:${srv.port}`;
    const res = await fetch(`${base}/metrics`);
    expect(res.ok).toBe(true);
    const text = await res.text();
    expect(text).toContain('sentinel_runtime_info');
    expect(text).toContain('engine="native"');
    expect(text).toContain('workers="3"');
    expect(text).toContain('cache_mode="mtime"');
    expect(text).toContain('scan_concurrency="8"');
    expect(text).toContain('rotate_concurrency="4"');
    expect(text).toContain('version="0.0.0-test"');
    await srv.close();
  }, 10000);
});
