#!/usr/bin/env node
import { scanPath } from './scanner.js';
import { createLogger } from './logger.js';
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
  .option('-I, --interactive', 'approve each finding interactively', false);

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
  const findings = await scanPath(target, extraIg, baseDir);
  logger.info(`Found ${findings.length} findings.`);
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
  for (const f of findings) {
    const doIt = await shouldApplyForFinding(f);
    const res = await rotator.rotate(f, {
      dryRun: opts.dryRun || rotator.name === 'dry-run' || !doIt,
      template: opts.template,
      verify: opts.verify,
    });
    if (res.success) logger.info(res.message as string);
    else logger.warn(res.message as string);
  }
  return 0;
}

// Note: No top-level execution here. See src/cli.ts for the CLI entry point.
