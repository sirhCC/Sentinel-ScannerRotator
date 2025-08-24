#!/usr/bin/env node
import { runCli } from './index.js';

runCli(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
