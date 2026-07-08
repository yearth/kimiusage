import { discoverWireFiles, defaultDataDirs } from './paths.js';
import { loadUsageRecords } from './parser.js';
import { filterRecords, summarizeDaily, summarizeMonthly, summarizeSessions } from './summary.js';
import { renderJson, renderTable } from './render.js';

export async function runCli(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv);
  if (options.help) {
    return usage();
  }

  const dataDirs = options.dataDirs.length > 0 ? options.dataDirs : defaultDataDirs(env);
  const files = await discoverWireFiles(dataDirs);
  const records = filterRecords(await loadUsageRecords(files), options);
  const rows = summarize(options.command, records, options);
  const output = options.json
    ? renderJson(rows)
    : renderTable(rows, options.command === 'session' ? 'Session' : 'Date');
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
    help: false,
  };

  const args = [...argv];
  if (args[0] && !args[0].startsWith('-')) {
    options.command = args.shift();
  }

  if (!['daily', 'monthly', 'session'].includes(options.command)) {
    throw new Error(`Unknown command: ${options.command}`);
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--since') {
      options.since = requireValue(args, ++index, arg);
    } else if (arg === '--until') {
      options.until = requireValue(args, ++index, arg);
    } else if (arg === '--timezone') {
      options.timeZone = requireValue(args, ++index, arg);
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
  if (command === 'monthly') return summarizeMonthly(records, options);
  if (command === 'session') return summarizeSessions(records);
  return summarizeDaily(records, options);
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
  kimiusage [daily|monthly|session] [options]

Options:
  --since YYYY-MM-DD      Include records on or after this date
  --until YYYY-MM-DD      Include records on or before this date
  --timezone IANA         Timezone for daily/monthly grouping (default: UTC)
  --data-dir PATH[,PATH]  Data roots to scan (default: KIMI_DATA_DIR or ~/.kimi-code, ~/.kimi)
  --json                  Print JSON
  --no-cost               Accepted for compatibility; cost is not implemented
  --offline               Accepted for compatibility; no network is used
  -h, --help              Show this help
`;
}
