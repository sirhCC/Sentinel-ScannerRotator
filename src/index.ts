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
};

export async function runCli(argsIn: string[]): Promise<number> {
  const args = argsIn.slice();
  const opts: CLIOptions = { target: ".", rotator: "dry-run", dryRun: false, force: false };
  if (args.length > 0 && !args[0].startsWith("--")) opts.target = args[0];
  const rIndex = args.indexOf("--rotator");
  if (rIndex >= 0 && args[rIndex + 1]) opts.rotator = args[rIndex + 1];
  if (args.includes("--dry-run")) opts.dryRun = true;
  if (args.includes("--force")) opts.force = true;
  const jsonLog = args.includes('--log-json');
  const levelIndex = args.indexOf('--log-level');
  const level = levelIndex >= 0 && args[levelIndex + 1] ? args[levelIndex + 1] as any : 'info';
  const logger = createLogger({ json: jsonLog, level });

  const rotators = [dryRunRotator, applyRotator];
  const rotator = rotators.find((r) => r.name === opts.rotator);
  if (!rotator) {
    logger.error(`Unknown rotator: ${opts.rotator}`);
    return 2;
  }

  // Require explicit force for apply when not dry-run
  if (rotator.name === "apply" && !opts.dryRun && !opts.force) {
    logger.error("Refusing to run 'apply' without --dry-run or --force. Use --force to confirm destructive changes.");
    return 3;
  }

  const findings = await scanPath(opts.target);
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
