import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { metadataFromPath } from './paths.js';

export async function loadUsageRecords(files) {
  const records = [];
  const diagnostics = [];
  const seen = new Set();
  const legacyModels = new Map();

  for (const file of files) {
    const metadata = metadataFromPath(file) ?? fallbackMetadata(file);
    let text;
    try {
      text = await readFile(file, 'utf8');
    } catch (error) {
      diagnostics.push({
        file,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    let legacyModel = 'kimi-for-coding';
    if (metadata.source === 'kimi') {
      if (!legacyModels.has(metadata.rootDir)) {
        legacyModels.set(metadata.rootDir, await readLegacyModel(metadata.rootDir));
      }
      legacyModel = legacyModels.get(metadata.rootDir);
    }

    for (const line of text.split(/\r?\n/)) {
      if (line.trim().length === 0) continue;
      const record = parseUsageLine(line, file, metadata, legacyModel);
      if (record === null) continue;
      const key = recordKey(record);
      if (seen.has(key)) continue;
      seen.add(key);
      records.push(record);
    }
  }

  records.sort((a, b) => a.time - b.time);
  return { records, diagnostics };
}

export function parseUsageLine(
  line,
  file = '',
  metadata = fallbackMetadata(file),
  legacyModel = 'kimi-for-coding',
) {
  let data;
  try {
    data = JSON.parse(line);
  } catch {
    return null;
  }

  const normalizedMetadata = typeof metadata === 'string'
    ? { ...fallbackMetadata(file), sessionId: metadata }
    : metadata;
  const isModern = data.type === 'usage.record';
  if (isModern && data.usageScope !== 'turn') return null;

  const modernUsage = isModern ? data.usage : null;
  const legacyPayload = data.message?.type === 'StatusUpdate' ? data.message?.payload : null;
  const legacyUsage = legacyPayload?.token_usage;
  const usage = modernUsage ?? legacyUsage;
  if (usage === null || typeof usage !== 'object') return null;

  const inputTokens = numberValue(usage.inputOther ?? usage.input_other);
  const outputTokens = numberValue(usage.output);
  const cacheReadTokens = numberValue(usage.inputCacheRead ?? usage.input_cache_read);
  const cacheCreationTokens = numberValue(
    usage.inputCacheCreation ?? usage.input_cache_creation,
  );
  const explicitTotal = numberValue(usage.total);
  const totalTokens = explicitTotal > 0
    ? explicitTotal
    : inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens;
  if (totalTokens === 0) return null;

  const time = timeValue(data.time ?? data.created_at ?? data.timestamp);
  if (time === null) return null;

  return {
    file,
    source: normalizedMetadata.source,
    workspace: normalizedMetadata.workspace,
    sessionId: normalizedMetadata.sessionId,
    agentId: normalizedMetadata.agentId,
    time,
    model: normalizeModel(isModern ? data.model : legacyModel),
    messageId: legacyPayload?.message_id ?? null,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    totalTokens,
  };
}

function fallbackMetadata(file) {
  return {
    source: 'unknown',
    rootDir: '',
    workspace: null,
    sessionId: sessionIdFromPath(file),
    agentId: null,
  };
}

async function readLegacyModel(rootDir) {
  try {
    const config = JSON.parse(await readFile(join(rootDir, 'config.json'), 'utf8'));
    return normalizeModel(config.model);
  } catch {
    return 'kimi-for-coding';
  }
}

function normalizeModel(model) {
  if (typeof model !== 'string' || model.trim() === '') return 'kimi-for-coding';
  return model.trim().replace(/^kimi-code\//, '');
}

function recordKey(record) {
  return [
    record.source,
    record.workspace ?? '',
    record.sessionId,
    record.agentId ?? '',
    record.time,
    record.model,
    record.messageId ?? '',
    record.inputTokens,
    record.outputTokens,
    record.cacheReadTokens,
    record.cacheCreationTokens,
  ].join('|');
}

export function sessionIdFromPath(file) {
  return metadataFromPath(file)?.sessionId ?? 'unknown';
}

function numberValue(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function timeValue(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value < 1e12 ? Math.round(value * 1000) : value;
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}
