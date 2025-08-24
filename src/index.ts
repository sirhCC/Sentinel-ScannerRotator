#!/usr/bin/env node
import { scanPath } from "./scanner";
import { dryRunRotator } from "./rotators/dryRunRotator";
import { applyRotator } from "./rotators/applyRotator";
import { argv } from "process";
import { createLogger } from "./logger";

type CLIOptions = {
  target: string;
  rotator: string;
  dryRun: boolean;
  force: boolean;
  config?: string;
  rotatorsDirs?: string[];
};

export async function runCli(argsIn: string[]): Promise<number> {
  const args = argsIn.slice();
  const opts: CLIOptions = { target: ".", rotator: "dry-run", dryRun: false, force: false };
  if (args.includes('--help') || args.includes('-h')) {
    const usage = `SecretSentinel-ScannerRotator\n\n` +
      `Usage:\n  sentinel [target] [--rotator <dry-run|apply>] [--dry-run] [--force]\\\n` +
      `          [--ignore <glob> ...] [--log-json] [--log-level <level>] [--config <path>]\\\n` +
      `          [--rotators-dir <dir> ...] [--help]\n\n` +
      `Flags:\n` +
      `  --rotator <name>   Which rotator to use (dry-run | apply). Default: dry-run.\n` +
      `  --dry-run          Do not modify files; only report actions.\n` +
      `  --force            Required to run apply when not using --dry-run.\n` +
      `  --ignore <glob>    Add an ignore pattern (repeatable).\n` +
      `  --log-json         Emit JSON logs.\n` +
      `  --log-level <lvl>  error | warn | info | debug. Default: info.\n` +
  `  --config <path>    Path to a config file or directory to resolve .secretsentinel.yaml/.json.\n` +
  `  --rotators-dir <d> Additional directory to discover rotators (repeatable).\n` +
      `  --help, -h         Show this help.\n\n` +
      `Examples:\n` +
      `  sentinel . --rotator dry-run\n` +
      `  sentinel ./repo --rotator apply --force --ignore "**/*.lock" --log-json\n` +
  `  sentinel ./repo --config ./repo/.secretsentinel.json --rotators-dir ./plugins/rotators\n`;
    console.log(usage);
    return 0;
  }
  if (args.length > 0 && !args[0].startsWith("--")) opts.target = args[0];
  const rIndex = args.indexOf("--rotator");
  if (rIndex >= 0 && args[rIndex + 1]) opts.rotator = args[rIndex + 1];
  if (args.includes("--dry-run")) opts.dryRun = true;
  if (args.includes("--force")) opts.force = true;
  const cIdx = args.indexOf('--config');
  if (cIdx >= 0 && args[cIdx + 1]) opts.config = args[cIdx + 1];
  // collect --rotators-dir <dir> occurrences
  const rotDirs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--rotators-dir' && args[i+1]) { rotDirs.push(args[i+1]); i++; }
  }
  if (rotDirs.length) opts.rotatorsDirs = rotDirs;
  // collect --ignore <pattern> occurrences
  const extraIg: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ignore' && args[i+1]) { extraIg.push(args[i+1]); i++; }
  }
  const jsonLog = args.includes('--log-json');
  const levelIndex = args.indexOf('--log-level');
  const level = levelIndex >= 0 && args[levelIndex + 1] ? args[levelIndex + 1] as any : 'info';
  const logger = createLogger({ json: jsonLog, level });

  // Load rotators dynamically
  const { loadRotators } = await import('./rotators/loader.js').catch(() => import('./rotators/loader')) as any;
  const rotators = await loadRotators({ extraDirs: opts.rotatorsDirs });
  const rotator = rotators.find((r: any) => r.name === opts.rotator);
  if (!rotator) {
    logger.error(`Unknown rotator: ${opts.rotator}`);
    return 2;
  }

  // Require explicit force for apply when not dry-run
  if (rotator.name === "apply" && !opts.dryRun && !opts.force) {
    logger.error("Refusing to run 'apply' without --dry-run or --force. Use --force to confirm destructive changes.");
    return 3;
  }

  let baseDir: string | undefined;
  if (opts.config) {
    const path = await import('path');
    const fs = await import('fs/promises');
    try {
      const st = await fs.stat(opts.config);
      baseDir = st.isDirectory() ? opts.config : path.dirname(opts.config);
    } catch {
      // if the provided path doesn't exist, treat it as a directory hint
      baseDir = path.dirname(opts.config);
    }
  }
  const findings = await scanPath(opts.target, extraIg, baseDir);
  logger.info(`Found ${findings.length} findings.`);
  for (const f of findings) {
    const res = await rotator.rotate(f, { dryRun: opts.dryRun || rotator.name === "dry-run" });
    if (res.success) logger.info(res.message as string);
    else logger.warn(res.message as string);
  }
  return 0;
}

if (require.main === module) {
  runCli(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
