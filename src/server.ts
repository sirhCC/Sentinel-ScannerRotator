import http from 'http';
import { Metrics } from './metrics.js';

export type ServerHandle = {
  server: http.Server;
  port: number;
  close(): Promise<void>;
};

export function startMetricsServer(metrics: Metrics, opts?: { port?: number }): Promise<ServerHandle> {
  const port = opts?.port ?? 9095;
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        if (!req.url) { res.end(); return; }
        if (req.url.startsWith('/healthz')) {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('ok');
          return;
        }
        if (req.url.startsWith('/metrics')) {
          // Minimal shim: expose metrics via direct writer
          const lines: string[] = [];
          lines.push('# HELP sentinel_findings_total Total findings detected');
          lines.push('# TYPE sentinel_findings_total counter');
          lines.push(`sentinel_findings_total ${metrics.findings_total}`);
          for (const sev of ['low','medium','high'] as const) {
            lines.push(`# HELP sentinel_findings_severity_total Findings by severity`);
            lines.push('# TYPE sentinel_findings_severity_total counter');
            lines.push(`sentinel_findings_severity_total{severity="${sev}"} ${metrics.findings_by_severity[sev]}`);
          }
          lines.push('# HELP sentinel_rotations_total Rotations attempted');
          lines.push('# TYPE sentinel_rotations_total counter');
          lines.push(`sentinel_rotations_total ${metrics.rotations_total}`);
          lines.push('# HELP sentinel_rotations_success_total Rotations succeeded');
          lines.push('# TYPE sentinel_rotations_success_total counter');
          lines.push(`sentinel_rotations_success_total ${metrics.rotations_success}`);
          lines.push('# HELP sentinel_rotations_failed_total Rotations failed');
          lines.push('# TYPE sentinel_rotations_failed_total counter');
          lines.push(`sentinel_rotations_failed_total ${metrics.rotations_failed}`);
          const body = lines.join('\n') + '\n';
          res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
          res.end(body);
          return;
        }
        res.statusCode = 404;
        res.end('not found');
      } catch {
        res.statusCode = 500;
        res.end('error');
      }
    });
    server.on('error', (e) => reject(e));
    server.listen(port, () => {
      const addr = server.address();
      const p = typeof addr === 'string' ? 0 : (addr?.port || port);
      resolve({ server, port: p, close: () => new Promise<void>((res) => server.close(() => res())) });
    });
  });
}
