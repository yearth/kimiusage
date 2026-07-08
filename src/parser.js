import { readFile } from 'node:fs/promises';
import { dirname, sep } from 'node:path';

export async function loadUsageRecords(files) {
  const records = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    const sessionId = sessionIdFromPath(file);
    for (const line of text.split(/\r?\n/)) {
      if (line.trim().length === 0) continue;
      const record = parseUsageLine(line, file, sessionId);
      if (record !== null) records.push(record);
    }
  }
  return records.sort((a, b) => a.time - b.time);
}

export function parseUsageLine(line, file = '', sessionId = 'unknown') {
  let data;
  try {
    data = JSON.parse(line);
  } catch {
    return null;
  }

  const modernUsage = data.type === 'usage.record' ? data.usage : null;
  const legacyUsage =
    data.message?.type === 'StatusUpdate' ? data.message?.payload?.token_usage : null;
  const usage = modernUsage ?? legacyUsage;
  if (usage === null || typeof usage !== 'object') return null;

  const inputTokens = numberValue(usage.inputOther ?? usage.input_other);
  const outputTokens = numberValue(usage.output);
  const cacheReadTokens = numberValue(usage.inputCacheRead ?? usage.input_cache_read);
  const cacheCreationTokens = numberValue(
    usage.inputCacheCreation ?? usage.input_cache_creation,
  );
  const explicitTotal = numberValue(usage.total);
  const totalTokens =
    explicitTotal > 0
      ? explicitTotal
      : inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens;
  const time = timeValue(data.time ?? data.created_at);
  if (time === null) return null;

  return {
    file,
    sessionId,
    time,
    model: typeof data.model === 'string' && data.model.length > 0 ? data.model : 'unknown',
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    totalTokens,
  };
}

export function sessionIdFromPath(file) {
  const parts = file.split(sep);
  const sessionIndex = parts.findIndex((part) => part === 'sessions');
  if (sessionIndex === -1) return dirname(file).split(sep).at(-1) ?? 'unknown';

  const agentIndex = parts.findIndex((part, index) => index > sessionIndex && part === 'agents');
  if (agentIndex > sessionIndex + 1) return parts[agentIndex - 1] ?? 'unknown';
  return parts.at(-2) ?? 'unknown';
}

function numberValue(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function timeValue(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}
