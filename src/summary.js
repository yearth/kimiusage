export function summarizeDaily(records, options = {}) {
  return summarizeBy(records, (record) => dateKey(record.time, options.timeZone));
}

export function summarizeMonthly(records, options = {}) {
  return summarizeBy(records, (record) => dateKey(record.time, options.timeZone).slice(0, 7));
}

export function summarizeSessions(records) {
  return summarizeBy(records, (record) => record.sessionId);
}

export function filterRecords(records, { since, until } = {}) {
  const sinceTime = since ? Date.parse(`${since}T00:00:00Z`) : null;
  const untilTime = until ? Date.parse(`${until}T23:59:59.999Z`) : null;
  return records.filter((record) => {
    if (sinceTime !== null && record.time < sinceTime) return false;
    if (untilTime !== null && record.time > untilTime) return false;
    return true;
  });
}

function summarizeBy(records, keyFn) {
  const groups = new Map();
  for (const record of records) {
    const key = keyFn(record);
    const group = groups.get(key) ?? {
      key,
      sessionIds: new Set(),
      modelNames: new Set(),
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      totalTokens: 0,
    };
    group.sessionIds.add(record.sessionId);
    group.modelNames.add(record.model);
    group.inputTokens += record.inputTokens;
    group.outputTokens += record.outputTokens;
    group.cacheReadTokens += record.cacheReadTokens;
    group.cacheCreationTokens += record.cacheCreationTokens;
    group.totalTokens += record.totalTokens;
    groups.set(key, group);
  }

  return Array.from(groups.values())
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((group) => ({
      key: group.key,
      sessions: group.sessionIds.size,
      models: Array.from(group.modelNames).sort(),
      inputTokens: group.inputTokens,
      outputTokens: group.outputTokens,
      cacheReadTokens: group.cacheReadTokens,
      cacheCreationTokens: group.cacheCreationTokens,
      totalTokens: group.totalTokens,
    }));
}

function dateKey(time, timeZone = 'UTC') {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date(time));
}
