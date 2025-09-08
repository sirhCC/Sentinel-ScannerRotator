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
          if (metrics.runtime_info) {
            const ri = metrics.runtime_info;
            const esc = (v: any) => String(v ?? '').replace(/"/g, '\\"');
            const labels = [
              `engine="${esc(ri.engine)}"`,
              `workers="${esc(ri.workers)}"`,
              `cache_mode="${esc(ri.cacheMode)}"`,
              `scan_concurrency="${esc(ri.scanConcurrency)}"`,
              `rotate_concurrency="${esc(ri.rotateConcurrency)}"`,
              `version="${esc(ri.version)}"`,
            ].join(',');
            lines.push('# HELP sentinel_runtime_info Sentinel runtime configuration info');
            lines.push('# TYPE sentinel_runtime_info gauge');
            lines.push(`sentinel_runtime_info{${labels}} 1`);
          }
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
          lines.push('# HELP sentinel_rules_compiled_total Rules compiled (per run)');
          lines.push('# TYPE sentinel_rules_compiled_total counter');
          lines.push(`sentinel_rules_compiled_total ${metrics.rules_compiled_total}`);
          lines.push('# HELP sentinel_files_skipped_total Files skipped');
          lines.push('# TYPE sentinel_files_skipped_total counter');
          lines.push(`sentinel_files_skipped_total ${metrics.files_skipped_total}`);
          lines.push('# HELP sentinel_files_skipped_reason_total Files skipped by reason');
          lines.push('# TYPE sentinel_files_skipped_reason_total counter');
          for (const [reason, n] of Object.entries(metrics.files_skipped_by_reason)) {
            lines.push(`sentinel_files_skipped_reason_total{reason="${reason}"} ${n}`);
          }
          lines.push('# HELP sentinel_ml_findings_total Findings produced by ML hook');
          lines.push('# TYPE sentinel_ml_findings_total counter');
          lines.push(`sentinel_ml_findings_total ${metrics.ml_findings_total}`);
          lines.push('# HELP sentinel_ml_invocations_total ML hook invocations');
          lines.push('# TYPE sentinel_ml_invocations_total counter');
          lines.push(`sentinel_ml_invocations_total ${metrics.ml_invocations_total}`);
          lines.push('# HELP sentinel_ml_errors_total ML hook errors');
          lines.push('# TYPE sentinel_ml_errors_total counter');
          lines.push(`sentinel_ml_errors_total ${metrics.ml_errors_total}`);
          lines.push('# HELP sentinel_ml_time_ms_total Total time spent in ML hook (ms)');
          lines.push('# TYPE sentinel_ml_time_ms_total counter');
          lines.push(`sentinel_ml_time_ms_total ${metrics.ml_time_ms_total}`);
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
