#!/usr/bin/env node

import { runCli } from '../src/cli.js';

try {
  const result = await runCli();
  process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`kimiusage: ${message}\n`);
  process.exitCode = 1;
}
