#!/usr/bin/env node
import { scanPath } from "./scanner";
import { dryRunRotator } from "./rotators/dryRunRotator";
import { applyRotator } from "./rotators/applyRotator";
import { argv } from "process";

async function main() {
  const args = argv.slice(2);
  const target = args[0] ?? ".";
  const rotatorName = (() => {
    const i = args.indexOf("--rotator");
    if (i >= 0 && args[i + 1]) return args[i + 1];
    return "dry-run";
  })();

  const rotators = [dryRunRotator, applyRotator];
  const rotator = rotators.find((r) => r.name === rotatorName);
  if (!rotator) {
    console.error(`Unknown rotator: ${rotatorName}`);
    process.exit(2);
  }

  const findings = await scanPath(target);
  console.log(`Found ${findings.length} findings.`);
  for (const f of findings) {
    const res = await rotator.rotate(f, { dryRun: rotator.name === "dry-run" });
    console.log(res.message);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
