#!/usr/bin/env node
import { scanPath } from './scanner.js';
import { createLogger } from './logger.js';
import { createAuditWriter } from './audit.js';
import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';
import { restoreLastBackup } from './undo.js';

export async function runCli(argsIn: string[], envOverride?: Record<string, string | undefined>): Promise<number> {
  // Optional: apply per-invocation environment overrides (useful for tests)
  const savedEnv: Record<string, string | undefined> = {};
  if (envOverride && typeof envOverride === 'object') {
    for (const [k, v] of Object.entries(envOverride)) {
      savedEnv[k] = process.env[k];
      if (v === undefined) delete (process.env as any)[k];
      else (process.env as any)[k] = v;
    }
  }
  try {
  // Early subcommand: undo
  if (argsIn[0] === 'undo') {
    const target = argsIn[1];
    if (!target) {
      console.error('Usage: sentinel undo <file>');
      return 1;
    }
    const res = await restoreLastBackup(path.resolve(target));
    if (res.success) {
      console.log(res.message);
      return 0;
    }
    console.error(res.message);
    return 1;
  }
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
  .option('--list-rulesets', 'list available curated rulesets and exit', false)
  .option('--rulesets <names>', 'comma- or space-separated curated rulesets to enable (also via SENTINEL_RULESETS env)')
  .option('--rulesets-dirs <dirs>', 'comma-separated directories to discover external *.ruleset.json files (SENTINEL_RULESETS_DIRS)')
  .option('--rulesets-catalog <urlOrFile>', 'ruleset marketplace catalog (http(s):// or file path)')
  .option('--rulesets-install <names>', 'install rulesets from catalog into cache dir (comma- or space-separated)')
  .option('--rulesets-cache-dir <dir>', 'cache directory for installed rulesets (default ./.sentinel_rulesets)')
  .option('--rulesets-require-signed', 'require ed25519 signatures for installed rulesets', false)
  .option('--rulesets-pubkey <pemOrPath>', 'PEM public key for verifying signed rulesets (or set SENTINEL_RULESET_PUBKEY)')
  .option('--rulesets-catalog-require-signed', 'require detached signature for catalog (catalog.json.sig)', false)
  .option('--rulesets-catalog-pubkey <pemOrPath>', 'PEM public key to verify catalog signature')
  .option('--disable-builtin-rules', 'disable built-in rules (SENTINEL_DISABLE_BUILTIN_RULES=true)', false)
  .option('--issues', 'auto-create issues on fail-on-findings (file provider default)', false)
  .option('--issues-file <path>', 'issues file path for file provider (.sentinel_issues.ndjson default)')
  .option('--issues-provider <name>', 'issues provider: file | github (default file)')
  .option('--issues-repo <owner/name>', 'for github provider: repository, e.g., org/repo')
  .option('--metrics <path>', 'write Prometheus-format metrics to file at end of run')
  .option('--metrics-server', 'serve Prometheus metrics over HTTP (default port 9095)', false)
  .option('--metrics-port <n>', 'port for --metrics-server', (v) => parseInt(v, 10))
  .option('--fail-on-findings', 'exit non-zero if any findings are found (skips rotation)', false)
  .option('--fail-threshold <n>', 'exit non-zero if findings exceed N (with --fail-on-findings)', (v) => parseInt(v, 10))
  .option('--fail-threshold-high <n>', 'with --fail-on-findings: fail if HIGH severity findings exceed N', (v) => parseInt(v, 10))
  .option('--fail-threshold-medium <n>', 'with --fail-on-findings: fail if MEDIUM severity findings exceed N', (v) => parseInt(v, 10))
  .option('--fail-threshold-low <n>', 'with --fail-on-findings: fail if LOW severity findings exceed N', (v) => parseInt(v, 10))
  .option('--min-severity <sev>', 'minimum severity for threshold counting (low|medium|high)');

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
  // metrics init
  const { newMetrics, writeProm } = await import('./metrics.js');
  const m = newMetrics();
  // Optional HTTP metrics server
  let srv: any;
  if (opts.metricsServer) {
    try {
      const { startMetricsServer } = await import('./server.js');
      srv = await startMetricsServer(m, { port: opts.metricsPort });
    } catch (e: any) {
      console.error(e?.message || String(e));
    }
  }
  // Apply ruleset-related options to env to keep lower layers simple
  if (typeof opts.disableBuiltinRules === 'boolean' && opts.disableBuiltinRules) {
    process.env.SENTINEL_DISABLE_BUILTIN_RULES = 'true';
  }
  if (opts.rulesets) {
    process.env.SENTINEL_RULESETS = String(opts.rulesets);
  }
  if (opts.rulesetsDirs) {
    process.env.SENTINEL_RULESETS_DIRS = String(opts.rulesetsDirs);
  }
  // Marketplace install: fetch catalog entries and cache locally, then add cache dir to discovery
  if (opts.rulesetsCatalog && opts.rulesetsInstall) {
    const { installRulesets } = await import('./rules/marketplace.js');
    const names = String(opts.rulesetsInstall).split(/[,;\s]+/).filter(Boolean);
    const dir = String(opts.rulesetsCacheDir || path.join(process.cwd(), '.sentinel_rulesets'));
    try {
      let pubkey = process.env.SENTINEL_RULESET_PUBKEY;
      let catalogPubkey: string | undefined;
      if (opts.rulesetsPubkey) {
        const v = String(opts.rulesetsPubkey);
        try {
          // If looks like a path to a file, read it; otherwise assume PEM content
          if (v.includes('-----BEGIN') || v.includes('\n')) pubkey = v;
          else {
            const pem = await fs.readFile(v, 'utf8');
            pubkey = pem;
          }
        } catch {
          pubkey = v; // fallback to raw content
        }
      }
      if (opts.rulesetsCatalogPubkey) {
        const v = String(opts.rulesetsCatalogPubkey);
        try {
          if (v.includes('-----BEGIN') || v.includes('\n')) catalogPubkey = v;
          else catalogPubkey = await fs.readFile(v, 'utf8');
        } catch {
          catalogPubkey = v;
        }
      }
      await installRulesets({
        catalog: String(opts.rulesetsCatalog),
        names,
        cacheDir: dir,
        pubkey,
        requireSigned: !!opts.rulesetsRequireSigned,
        catalogPubkey,
        catalogRequireSigned: !!opts.rulesetsCatalogRequireSigned,
      });
      const prev = (process.env.SENTINEL_RULESETS_DIRS || '').trim();
      process.env.SENTINEL_RULESETS_DIRS = prev ? `${prev};${dir}` : dir;
    } catch (e: any) {
      console.error(e?.message || String(e));
      return 1;
    }
  }

  // Handle --list-rulesets
  if (opts.listRulesets) {
    try {
      const { listRulesets } = await import('./rules/library.js');
  const names = await listRulesets((process.env.SENTINEL_RULESETS_DIRS || '').split(/[,;]+/).filter(Boolean));
      if (opts.logJson) console.log(JSON.stringify({ rulesets: names }));
      else console.log(`Available rulesets: ${names.join(', ')}`);
      return 0;
    } catch (e: any) {
      console.error(e?.message || String(e));
      return 1;
    }
  }
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
  // Default baseDir to the target path so policy/rules discovery resolves relative to scanned tree
  if (!baseDir) {
    try {
      const st = await fs.stat(target);
      baseDir = st.isDirectory() ? target : path.dirname(target);
    } catch {}
  }
  const envScanConc = Number(process.env.SENTINEL_SCAN_CONCURRENCY);
  const scanConc = (opts.scanConcurrency ?? (isNaN(envScanConc) ? undefined : envScanConc));
  const cachePath = opts.cache || process.env.SENTINEL_CACHE;
  const findings = await scanPath(target, extraIg, baseDir, { concurrency: scanConc, cachePath });
  logger.info(`Found ${findings.length} findings.`);
  m.findings_total = findings.length;
  for (const f of findings) {
    const s = String(f.severity || 'medium').toLowerCase() as 'low'|'medium'|'high';
    m.findings_by_severity[s] = (m.findings_by_severity[s] || 0) + 1 as any;
  }
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
    // Normalize and validate policy
    const validSev = (s: any): 'low'|'medium'|'high'|undefined => {
      const v = String(s || '').toLowerCase();
      return v === 'low' || v === 'medium' || v === 'high' ? (v as any) : undefined;
    };
    const rank = { low: 1, medium: 2, high: 3 } as const;
    const cliMin = validSev((opts as any).minSeverity);
    if ((opts as any).minSeverity && !cliMin) {
      logger.warn(`Ignoring invalid --min-severity=${JSON.stringify((opts as any).minSeverity)} (expected low|medium|high)`);
    }
    const minSeverity: 'low'|'medium'|'high'|undefined = cliMin ?? validSev(policy?.minSeverity);
    if (!cliMin && policy?.minSeverity && !minSeverity) {
      logger.warn(`Ignoring invalid policy.minSeverity=${JSON.stringify(policy.minSeverity)} (expected low|medium|high)`);
    }
    // Apply minSeverity as a filter for threshold counting
    const considered = minSeverity
      ? findings.filter((f: any) => rank[String((f.severity || 'medium')).toLowerCase() as 'low'|'medium'|'high'] >= rank[minSeverity])
      : findings;
    // Per-severity thresholds (only enforced if provided) computed on considered set
    const sevCounts = considered.reduce((acc: Record<string, number>, f: any) => {
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
  const checkSev = (name: 'high'|'medium'|'low', thr: number | undefined) => {
      if (!Number.isFinite(thr)) return false;
      const n = sevCounts[name] || 0;
      if (n > (thr as number)) {
    logger.error(`Failing due to ${name.toUpperCase()} severity findings (${n}) exceeding threshold (${thr}).`, minSeverity ? { minSeverity } : undefined);
        return true;
      }
      return false;
    };
    const thrHigh = Number.isFinite(opts.failThresholdHigh) ? opts.failThresholdHigh : policy?.thresholds?.high;
    const thrMed = Number.isFinite(opts.failThresholdMedium) ? opts.failThresholdMedium : policy?.thresholds?.medium;
    const thrLow = Number.isFinite(opts.failThresholdLow) ? opts.failThresholdLow : policy?.thresholds?.low;
    const tripped = checkSev('high', thrHigh) || checkSev('medium', thrMed) || checkSev('low', thrLow);
    if (tripped) {
      if (opts.issues) {
        try {
          const { createIssues } = await import('./issues.js');
          const provider = (opts.issuesProvider || process.env.SENTINEL_ISSUES_PROVIDER) as string | undefined;
          if ((provider || '').toLowerCase() === 'github') {
            await createIssues(findings as any, { provider: 'github', repo: opts.issuesRepo });
          } else {
            await createIssues(findings as any, { filePath: opts.issuesFile });
          }
        } catch {}
      }
      if (opts.metrics) {
        try { await writeProm(m, opts.metrics); } catch {}
      }
      return 4;
    }
    const threshold: number = Number.isFinite(opts.failThreshold) ? opts.failThreshold : (policy?.thresholds?.total ?? 0);
    if (considered.length > threshold) {
      logger.error(`Failing due to findings (${considered.length}) exceeding threshold (${threshold}).`, minSeverity ? { minSeverity } : undefined);
      if (opts.issues) {
        try {
          const { createIssues } = await import('./issues.js');
          const provider = (opts.issuesProvider || process.env.SENTINEL_ISSUES_PROVIDER) as string | undefined;
          if ((provider || '').toLowerCase() === 'github') {
            await createIssues(findings as any, { provider: 'github', repo: opts.issuesRepo });
          } else {
            await createIssues(findings as any, { filePath: opts.issuesFile });
          }
        } catch {}
      }
      if (opts.metrics) {
        try { await writeProm(m, opts.metrics); } catch {}
      }
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
      // If rotator supports batch, use it for a single write per file
  const hasBatch = (r: any): r is { name: string; rotateFile: (filePath: string, findings: any[], options?: any) => Promise<any[]> } => typeof r?.rotateFile === 'function';
  if (hasBatch(rotator)) {
        const approvals: boolean[] = [];
        for (const f of group) approvals.push(await shouldApplyForFinding(f));
        const anyApprove = approvals.some(Boolean);
        const dryRun = opts.dryRun || rotator.name === 'dry-run' || !anyApprove;
  const results = await rotator.rotateFile(file, group, { dryRun, template: opts.template, verify: opts.verify });
        // Treat as one rotation event for metrics/logging granularity
        m.rotations_total++;
        const ok = results.every((r: any) => r?.success);
        if (ok) m.rotations_success++; else m.rotations_failed++;
        const msg = results[0]?.message || (ok ? `Rotated ${group.length} findings in ${file}` : `Failed to rotate findings in ${file}`);
        if (ok) logger.info(msg as string); else logger.warn(msg as string);
        if (auditor) {
          for (let i = 0; i < group.length; i++) {
            const f = group[i];
            await auditor.write({
              ts: Date.now(),
              file: f.filePath,
              line: f.line,
              column: f.column,
              match: f.match,
              rotator: rotator.name,
              dryRun,
              verify: opts.verify || false,
              success: !!ok,
              message: results[i]?.message,
            });
          }
        }
      } else {
        for (const f of group) {
          const doIt = await shouldApplyForFinding(f);
          const res = await rotator.rotate(f, {
            dryRun: opts.dryRun || rotator.name === 'dry-run' || !doIt,
            template: opts.template,
            verify: opts.verify,
          });
          m.rotations_total++;
          if (res.success) m.rotations_success++; else m.rotations_failed++;
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
  }
  const workers = Array.from({ length: Math.min(rotateConc, files.length || 1) }, () => rotateWorker());
  await Promise.all(workers);
  if (auditor) await auditor.close();
  if (opts.metrics) {
    try { await writeProm(m, opts.metrics); } catch {}
  }
  if (srv) {
    try { await srv.close(); } catch {}
  }
  return 0;
  } finally {
    // restore env
    if (envOverride && typeof envOverride === 'object') {
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v === undefined) delete (process.env as any)[k];
        else (process.env as any)[k] = v;
      }
    }
  }
}

// Note: No top-level execution here. See src/cli.ts for the CLI entry point.
