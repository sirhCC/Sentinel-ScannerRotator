import fs from 'fs/promises';
import path from 'path';

export type Metrics = {
  findings_total: number;
  findings_by_severity: Record<'low'|'medium'|'high', number>;
  rotations_total: number;
  rotations_success: number;
  rotations_failed: number;
  rules_compiled_total: number;
  files_skipped_total: number;
  files_skipped_by_reason: Record<string, number>;
  ml_findings_total: number;
  ml_invocations_total: number;
  ml_errors_total: number;
  ml_time_ms_total: number;
  runtime_info?: {
    engine?: string;
    workers?: number;
    cacheMode?: string;
    scanConcurrency?: number | undefined;
    rotateConcurrency?: number | undefined;
    version?: string;
  };
};

export function newMetrics(): Metrics {
  return {
    findings_total: 0,
    findings_by_severity: { low: 0, medium: 0, high: 0 },
    rotations_total: 0,
    rotations_success: 0,
    rotations_failed: 0,
  rules_compiled_total: 0,
  files_skipped_total: 0,
  files_skipped_by_reason: {},
  ml_findings_total: 0,
  ml_invocations_total: 0,
  ml_errors_total: 0,
  ml_time_ms_total: 0,
  };
}

export async function writeProm(metrics: Metrics, filePath: string) {
  const lines: string[] = [];
  // Static runtime info (labels) emitted as a gauge value 1
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
  const out = lines.join('\n') + '\n';
  try { await fs.mkdir(path.dirname(filePath), { recursive: true }); } catch {}
  await fs.writeFile(filePath, out, 'utf8');
}
