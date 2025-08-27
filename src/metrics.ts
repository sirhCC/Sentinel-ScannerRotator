import fs from 'fs/promises';
import path from 'path';

export type Metrics = {
  findings_total: number;
  findings_by_severity: Record<'low'|'medium'|'high', number>;
  rotations_total: number;
  rotations_success: number;
  rotations_failed: number;
};

export function newMetrics(): Metrics {
  return {
    findings_total: 0,
    findings_by_severity: { low: 0, medium: 0, high: 0 },
    rotations_total: 0,
    rotations_success: 0,
    rotations_failed: 0,
  };
}

export async function writeProm(metrics: Metrics, filePath: string) {
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
  const out = lines.join('\n') + '\n';
  try { await fs.mkdir(path.dirname(filePath), { recursive: true }); } catch {}
  await fs.writeFile(filePath, out, 'utf8');
}
