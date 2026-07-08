#!/usr/bin/env node

import { runCli } from '../src/cli.js';

try {
  process.stdout.write(await runCli());
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`kimiusage: ${message}\n`);
  process.exitCode = 1;
}
