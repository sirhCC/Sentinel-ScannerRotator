#!/usr/bin/env node
import { scanPath } from './scanner.js';
import { createLogger } from './logger.js';
import { createAuditWriter } from './audit.js';
import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';

export async function runCli(argsIn: string[]): Promise<number> {
  const program = new Command();
  program
    .name('sentinel')
    .description('SecretSentinel-ScannerRotator')
    .argument('[target]', 'path to scan', '.')
  .option('-r, --rotator <name>', 'rotator to use (dry-run | apply)', 'dry-run')
  .option('-d, --dry-run', 'do not modify files; only report actions', false)
  .option('-f, --force', 'required to run apply when not using --dry-run', false)
  .option('-i, --ignore <glob...>', 'add ignore pattern(s) (repeatable)')
  .option('-j, --log-json', 'emit JSON logs', false)
  .option('-l, --log-level <lvl>', 'error | warn | info | debug', 'info')
  .option('-c, --config <path>', 'path to a config file or directory')
  .option('-L, --list-rotators', 'list available rotators and exit', false)
  .option('-t, --template <tpl>', 'replacement template for apply (supports {{match}}, {{timestamp}}, {{file}})')
  .option('--verify', 'verify backend stores by reading secret back before file update', false)
  .option('-x, --rotators-dir <dir...>', 'additional directories to discover rotators')
  .option('-I, --interactive', 'approve each finding interactively', false)
  .option('--audit <path>', 'write NDJSON audit events to a file')
  .option('--out <file>', 'write scan findings to a file (JSON or CSV; infers from extension)')
  .option('--out-format <fmt>', 'json | csv (overrides extension inference)')
  .option('--cache <path>', 'persist scan cache to a file to speed up repeated runs (or use SENTINEL_CACHE env)')
  .option('--scan-concurrency <n>', 'number of concurrent file scans (default 8 or SENTINEL_SCAN_CONCURRENCY)', (v) => parseInt(v, 10))
  .option('--rotate-concurrency <n>', 'number of concurrent rotations (default 4 or SENTINEL_ROTATE_CONCURRENCY)', (v) => parseInt(v, 10))
  .option('--fail-on-findings', 'exit non-zero if any findings are found (skips rotation)', false)
  .option('--fail-threshold <n>', 'exit non-zero if findings exceed N (with --fail-on-findings)', (v) => parseInt(v, 10))
  .option('--fail-threshold-high <n>', 'with --fail-on-findings: fail if HIGH severity findings exceed N', (v) => parseInt(v, 10))
  .option('--fail-threshold-medium <n>', 'with --fail-on-findings: fail if MEDIUM severity findings exceed N', (v) => parseInt(v, 10))
  .option('--fail-threshold-low <n>', 'with --fail-on-findings: fail if LOW severity findings exceed N', (v) => parseInt(v, 10));

  // Add version from package.json if available
  try {
    const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
    if (pkg?.version) program.version(pkg.version);
  } catch {}

  program.showHelpAfterError();
  // Prevent process.exit during tests; intercept help/version exits.
  program.exitOverride();
  let parsed;
  try {
    parsed = program.parse(argsIn, { from: 'user' });
  } catch (err: any) {
    if (err?.code === 'commander.helpDisplayed' || err?.code === 'commander.version') {
      return 0;
    }
    throw err;
  }
  const opts = parsed.opts();
  const target = parsed.args[0] || '.';

  const logger = createLogger({ json: !!opts.logJson, level: opts.logLevel || 'info' });

  // Load rotators dynamically
  const { loadRotators } = (await import('./rotators/loader.js')) as any;
  const rotators = await loadRotators({ extraDirs: opts.rotatorsDir });

  // If requested, list available rotators and exit
  if (opts.listRotators) {
  const set = new Set<string>(rotators.map((r: any) => r.name));
  // guarantee built-ins are present in listing
  set.add('dry-run');
  set.add('apply');
  const names = Array.from(set).sort();
    if (opts.logJson) console.log(JSON.stringify({ rotators: names }));
    else {
      console.log(`Available rotators: ${names.join(', ')}`);
    }
    return 0;
  }

  const rotator = rotators.find((r: any) => r.name === opts.rotator);
  if (!rotator) {
    logger.error(`Unknown rotator: ${opts.rotator}`);
    return 2;
  }

  // Require explicit force for apply when not dry-run
  if (rotator.name === 'apply' && !opts.dryRun && !opts.force && !opts.interactive) {
    logger.error("Refusing to run 'apply' without --dry-run or --force. Use --force to confirm destructive changes.");
    return 3;
  }

  const extraIg: string[] | undefined = opts.ignore;
  let baseDir: string | undefined;
  if (opts.config) {
    try {
      const st = await fs.stat(opts.config);
      baseDir = st.isDirectory() ? opts.config : path.dirname(opts.config);
    } catch {
      baseDir = path.dirname(opts.config);
    }
  }
  const envScanConc = Number(process.env.SENTINEL_SCAN_CONCURRENCY);
  const scanConc = (opts.scanConcurrency ?? (isNaN(envScanConc) ? undefined : envScanConc));
  const cachePath = opts.cache || process.env.SENTINEL_CACHE;
  const findings = await scanPath(target, extraIg, baseDir, { concurrency: scanConc, cachePath });
  logger.info(`Found ${findings.length} findings.`);
  // Optional export of findings to JSON/CSV
  async function exportFindingsIfRequested() {
    if (!opts.out) return;
    const outPath: string = opts.out;
    const outDir = path.dirname(outPath);
    try { await fs.mkdir(outDir, { recursive: true }); } catch {}
    const inferFmt = (p: string) => (p.toLowerCase().endsWith('.csv') ? 'csv' : 'json');
    const fmt: 'json' | 'csv' = (opts.outFormat || inferFmt(outPath)).toLowerCase();
    if (fmt === 'json') {
      const minimized = findings.map((f: any) => ({ file: f.filePath, line: f.line, column: f.column, match: f.match, rule: f.ruleName, severity: f.severity }));
      await fs.writeFile(outPath, JSON.stringify(minimized, null, 2), 'utf8');
    } else {
      const header = 'file,line,column,match\n';
      const esc = (v: any) => '"' + String(v).replace(/"/g, '""') + '"';
      const rows = findings.map((f: any) => [esc(f.filePath), f.line, f.column, esc(f.match)].join(','));
      await fs.writeFile(outPath, header + rows.join('\n') + (rows.length ? '\n' : ''), 'utf8');
    }
    logger.info(`Wrote findings to ${outPath}`);
  }
  await exportFindingsIfRequested();
  // CI guard: optionally fail fast on findings, skipping rotations
  if (opts.failOnFindings) {
    // Load optional project policy
    let policy: any;
    try {
      const { loadPolicy } = await import('./policy.js');
      policy = await loadPolicy(baseDir);
    } catch {}
    // Per-severity thresholds (only enforced if provided)
    const sevCounts = findings.reduce((acc: Record<string, number>, f: any) => {
      const sev = (f.severity || 'medium').toLowerCase();
      acc[sev] = (acc[sev] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    // Forbidden rules
    if (policy?.forbidRules && Array.isArray(policy.forbidRules) && policy.forbidRules.length) {
      const hit = findings.find((f: any) => f.ruleName && policy.forbidRules.includes(f.ruleName));
      if (hit) {
        logger.error(`Failing due to forbidden rule matched: ${hit.ruleName} in ${hit.filePath}:${hit.line}`);
        return 4;
      }
    }
    // Minimum severity gate
    if (policy?.minSeverity) {
      const order = { low: 1, medium: 2, high: 3 } as Record<string, number>;
      const minRank = order[String(policy.minSeverity).toLowerCase()] || 0;
      const anyAtLeast = findings.some((f: any) => (order[String((f.severity || 'medium')).toLowerCase()] || 0) >= minRank);
      if (anyAtLeast && minRank > 0) {
        // continue to threshold checks; minSeverity is a filter gate not a direct fail
      }
    }
    const checkSev = (name: 'high'|'medium'|'low', thr: number | undefined) => {
      if (!Number.isFinite(thr)) return false;
      const n = sevCounts[name] || 0;
      if (n > (thr as number)) {
        logger.error(`Failing due to ${name.toUpperCase()} severity findings (${n}) exceeding threshold (${thr}).`);
        return true;
      }
      return false;
    };
    const thrHigh = Number.isFinite(opts.failThresholdHigh) ? opts.failThresholdHigh : policy?.thresholds?.high;
    const thrMed = Number.isFinite(opts.failThresholdMedium) ? opts.failThresholdMedium : policy?.thresholds?.medium;
    const thrLow = Number.isFinite(opts.failThresholdLow) ? opts.failThresholdLow : policy?.thresholds?.low;
    const tripped = checkSev('high', thrHigh) || checkSev('medium', thrMed) || checkSev('low', thrLow);
    if (tripped) return 4;
    const threshold: number = Number.isFinite(opts.failThreshold) ? opts.failThreshold : (policy?.thresholds?.total ?? 0);
    if (findings.length > threshold) {
      logger.error(`Failing due to findings (${findings.length}) exceeding threshold (${threshold}).`);
      return 4;
    }
  }
  const auditor = opts.audit ? await createAuditWriter(opts.audit, false) : undefined;
  async function shouldApplyForFinding(f: any) {
    if (!opts.interactive || opts.dryRun) return true;
    const auto = (process.env.SENTINEL_INTERACTIVE_AUTO || '').toLowerCase();
    if (auto === 'yes' || auto === 'y' || auto === 'true') return true;
    if (auto === 'no' || auto === 'n' || auto === 'false') return false;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const q = (prompt: string) => new Promise<string>((resolve) => rl.question(prompt, resolve));
    const answer = (await q(`Apply ${rotator.name} to ${f.filePath}:${f.line} match="${f.match}" ? [y/N] `)).trim().toLowerCase();
    rl.close();
    return answer === 'y' || answer === 'yes';
  }
  // Concurrency for rotations, but avoid multiple concurrent edits to the same file.
  const byFile = new Map<string, any[]>();
  for (const f of findings) {
    const arr = byFile.get(f.filePath) || [];
    arr.push(f);
    byFile.set(f.filePath, arr);
  }
  const files = Array.from(byFile.keys());
  const envRotateConc = Number(process.env.SENTINEL_ROTATE_CONCURRENCY);
  const rotateConc = Math.max(1, (opts.rotateConcurrency ?? (isNaN(envRotateConc) ? undefined : envRotateConc)) ?? 4);
  let fi = 0;
  async function rotateWorker() {
    while (true) {
      const idx = fi++;
      if (idx >= files.length) break;
      const file = files[idx];
      const group = byFile.get(file)!;
      for (const f of group) {
        const doIt = await shouldApplyForFinding(f);
        const res = await rotator.rotate(f, {
          dryRun: opts.dryRun || rotator.name === 'dry-run' || !doIt,
          template: opts.template,
          verify: opts.verify,
        });
        if (res.success) logger.info(res.message as string);
        else logger.warn(res.message as string);
        if (auditor) {
          await auditor.write({
            ts: Date.now(),
            file: f.filePath,
            line: f.line,
            column: f.column,
            match: f.match,
            rotator: rotator.name,
            dryRun: opts.dryRun || rotator.name === 'dry-run' || !doIt,
            verify: opts.verify || false,
            success: res.success,
            message: res.message,
          });
        }
      }
    }
  }
  const workers = Array.from({ length: Math.min(rotateConc, files.length || 1) }, () => rotateWorker());
  await Promise.all(workers);
  if (auditor) await auditor.close();
  return 0;
}

// Note: No top-level execution here. See src/cli.ts for the CLI entry point.
