export function summarizeDaily(records, options = {}) {
  return summarizeBy(records, (record) => dateKey(record.time, options.timeZone));
}

export function summarizeWeekly(records, options = {}) {
  return summarizeBy(records, (record) =>
    weekKey(record.time, options.timeZone, options.startOfWeek ?? 'sunday'),
  );
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
      modelBreakdowns: new Map(),
    };
    group.sessionIds.add(record.sessionId);
    group.modelNames.add(record.model);
    group.inputTokens += record.inputTokens;
    group.outputTokens += record.outputTokens;
    group.cacheReadTokens += record.cacheReadTokens;
    group.cacheCreationTokens += record.cacheCreationTokens;
    group.totalTokens += record.totalTokens;
    addModelBreakdown(group.modelBreakdowns, record);
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
      modelBreakdowns: Array.from(group.modelBreakdowns.values()).sort((a, b) =>
        a.model.localeCompare(b.model),
      ),
    }));
}

function addModelBreakdown(modelBreakdowns, record) {
  const breakdown = modelBreakdowns.get(record.model) ?? {
    model: record.model,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    totalTokens: 0,
  };
  breakdown.inputTokens += record.inputTokens;
  breakdown.outputTokens += record.outputTokens;
  breakdown.cacheReadTokens += record.cacheReadTokens;
  breakdown.cacheCreationTokens += record.cacheCreationTokens;
  breakdown.totalTokens += record.totalTokens;
  modelBreakdowns.set(record.model, breakdown);
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

function weekKey(time, timeZone = 'UTC', startOfWeek = 'sunday') {
  const date = localDateParts(time, timeZone);
  const utc = Date.UTC(date.year, date.month - 1, date.day);
  const day = new Date(utc).getUTCDay();
  const startIndex = weekStartIndex(startOfWeek);
  const diff = (day - startIndex + 7) % 7;
  return isoDate(utc - diff * 24 * 60 * 60 * 1000);
}

function localDateParts(time, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(time));
  return {
    year: Number(parts.find((part) => part.type === 'year')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value),
    day: Number(parts.find((part) => part.type === 'day')?.value),
  };
}

function weekStartIndex(startOfWeek) {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const index = days.indexOf(String(startOfWeek).toLowerCase());
  if (index === -1) throw new Error(`Invalid start of week: ${startOfWeek}`);
  return index;
}

function isoDate(time) {
  return new Date(time).toISOString().slice(0, 10);
}
