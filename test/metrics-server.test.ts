import { describe, it, expect } from 'vitest';

describe('metrics server', () => {
  it('serves /metrics and /healthz', async () => {
    const { newMetrics } = await import('../src/metrics');
    const { startMetricsServer } = await import('../src/server');
    const m = newMetrics();
    m.findings_total = 2;
    m.findings_by_severity.high = 1;
    m.findings_by_severity.medium = 1;
    const srv = await startMetricsServer(m, { port: 0 });
    const base = `http://127.0.0.1:${srv.port}`;
    const h = await fetch(`${base}/healthz`);
    expect(h.ok).toBe(true);
    const res = await fetch(`${base}/metrics`);
    expect(res.ok).toBe(true);
    const text = await res.text();
    expect(text).toContain('sentinel_findings_total 2');
    await srv.close();
  }, 10000);
});
