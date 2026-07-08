import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function loadConfig(path, env = process.env) {
  const configPath = path ?? await discoverConfig(env);
  if (!configPath) return {};

  const text = await readFile(configPath, 'utf8');
  const parsed = JSON.parse(text);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid config file: ${configPath}`);
  }
  return parsed;
}

export async function discoverConfig(env = process.env) {
  const candidates = [];
  if (env.KIMIUSAGE_CONFIG) candidates.push(env.KIMIUSAGE_CONFIG);
  if (env.HOME) {
    candidates.push(join(env.HOME, '.config', 'kimiusage', 'config.json'));
    candidates.push(join(env.HOME, '.kimiusage.json'));
  }

  for (const candidate of candidates) {
    try {
      await readFile(candidate, 'utf8');
      return candidate;
    } catch {
      // Keep looking; config files are optional.
    }
  }
  return null;
}

export function applyConfig(options, config) {
  const commandConfig = config.commands?.[options.command] ?? {};
  return mergeOptions(mergeOptions(options, config.defaults ?? {}), commandConfig);
}

function mergeOptions(base, overrides) {
  const next = { ...base };
  if (typeof overrides.json === 'boolean' && !base.jsonExplicit) next.json = overrides.json;
  if (typeof overrides.compact === 'boolean' && !base.compactExplicit) next.compact = overrides.compact;
  if (typeof overrides.breakdown === 'boolean' && !base.breakdownExplicit) {
    next.breakdown = overrides.breakdown;
  }
  if (typeof overrides.timezone === 'string' && !base.timeZoneExplicit) {
    next.timeZone = overrides.timezone;
  }
  if (typeof overrides.timeZone === 'string' && !base.timeZoneExplicit) {
    next.timeZone = overrides.timeZone;
  }
  if (typeof overrides.since === 'string' && !base.since) next.since = overrides.since;
  if (typeof overrides.until === 'string' && !base.until) next.until = overrides.until;
  if (typeof overrides.startOfWeek === 'string' && !base.startOfWeekExplicit) {
    next.startOfWeek = overrides.startOfWeek;
  }
  if (Array.isArray(overrides.dataDirs) && base.dataDirs.length === 0) {
    next.dataDirs = overrides.dataDirs.filter((value) => typeof value === 'string' && value.length > 0);
  }
  if (typeof overrides.dataDir === 'string' && base.dataDirs.length === 0) {
    next.dataDirs = overrides.dataDir.split(',').filter(Boolean);
  }
  return next;
}
