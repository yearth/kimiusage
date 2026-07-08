import { discoverWireFiles, defaultDataDirs } from './paths.js';
import { loadUsageRecords } from './parser.js';
import {
  filterRecords,
  summarizeDaily,
  summarizeMonthly,
  summarizeSessions,
  summarizeWeekly,
} from './summary.js';
import { renderJson, renderTable } from './render.js';
import { applyConfig, loadConfig } from './config.js';

export async function runCli(argv = process.argv.slice(2), env = process.env) {
  const parsedOptions = parseArgs(argv);
  const options = applyConfig(parsedOptions, await loadConfig(parsedOptions.configPath, env));
  if (options.help) {
    return usage();
  }

  const dataDirs = options.dataDirs.length > 0 ? options.dataDirs : defaultDataDirs(env);
  const files = await discoverWireFiles(dataDirs);
  const records = filterRecords(await loadUsageRecords(files), options);
  const rows = summarize(options.command, records, options);
  const output = options.json
    ? renderJson(rows)
    : renderTable(rows, labelFor(options.command), options);
  return `${output}\n`;
}

export function parseArgs(argv) {
  const options = {
    command: 'daily',
    dataDirs: [],
    json: false,
    since: null,
    until: null,
    timeZone: 'UTC',
    startOfWeek: 'sunday',
    compact: false,
    breakdown: false,
    configPath: null,
    help: false,
  };

  const args = [...argv];
  if (args[0] && !args[0].startsWith('-')) {
    options.command = args.shift();
  }

  if (!['daily', 'weekly', 'monthly', 'session'].includes(options.command)) {
    throw new Error(`Unknown command: ${options.command}`);
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') {
      options.json = true;
      options.jsonExplicit = true;
    } else if (arg === '--compact') {
      options.compact = true;
      options.compactExplicit = true;
    } else if (arg === '--breakdown' || arg === '-b') {
      options.breakdown = true;
      options.breakdownExplicit = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--since') {
      options.since = requireValue(args, ++index, arg);
    } else if (arg === '--until') {
      options.until = requireValue(args, ++index, arg);
    } else if (arg === '--timezone') {
      options.timeZone = requireValue(args, ++index, arg);
      options.timeZoneExplicit = true;
    } else if (arg === '--start-of-week') {
      options.startOfWeek = requireValue(args, ++index, arg);
      options.startOfWeekExplicit = true;
    } else if (arg === '--config') {
      options.configPath = requireValue(args, ++index, arg);
    } else if (arg === '--data-dir') {
      options.dataDirs.push(...requireValue(args, ++index, arg).split(',').filter(Boolean));
    } else if (arg === '--no-cost' || arg === '--offline') {
      // Accepted for MVP compatibility; cost estimation is not implemented yet.
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function summarize(command, records, options) {
  if (command === 'weekly') return summarizeWeekly(records, options);
  if (command === 'monthly') return summarizeMonthly(records, options);
  if (command === 'session') return summarizeSessions(records);
  return summarizeDaily(records, options);
}

function labelFor(command) {
  if (command === 'session') return 'Session';
  if (command === 'weekly') return 'Week';
  if (command === 'monthly') return 'Month';
  return 'Date';
}

function requireValue(args, index, option) {
  const value = args[index];
  if (!value || value.startsWith('-')) {
    throw new Error(`Missing value for ${option}`);
  }
  return value;
}

function usage() {
  return `kimiusage - local usage reports for Kimi Code sessions

Usage:
  kimiusage [daily|weekly|monthly|session] [options]

Options:
  --since YYYY-MM-DD      Include records on or after this date
  --until YYYY-MM-DD      Include records on or before this date
  --timezone IANA         Timezone for daily/monthly grouping (default: UTC)
  --start-of-week DAY     Week start for weekly reports (default: sunday)
  --data-dir PATH[,PATH]  Data roots to scan (default: KIMI_DATA_DIR or ~/.kimi-code, ~/.kimi)
  --config PATH           Load defaults from a JSON config file
  --json                  Print JSON
  --breakdown             Show per-model breakdown rows
  --compact               Use a compact table layout
  --no-cost               Accepted for compatibility; cost is not implemented
  --offline               Accepted for compatibility; no network is used
  -h, --help              Show this help
`;
}
