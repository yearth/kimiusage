export function summarizeDaily(records, options = {}) {
  return summarizeBy(records, (record) => dateKey(record.time, options.timeZone), options);
}

export function summarizeWeekly(records, options = {}) {
  return summarizeBy(
    records,
    (record) => weekKey(record.time, options.timeZone, options.startOfWeek ?? 'sunday'),
    options,
  );
}

export function summarizeMonthly(records, options = {}) {
  return summarizeBy(
    records,
    (record) => dateKey(record.time, options.timeZone).slice(0, 7),
    options,
  );
}

export function summarizeSessions(records, options = {}) {
  return summarizeBy(records, (record) => record.sessionId, options);
}

export function filterRecords(records, { since, until, timeZone = 'UTC' } = {}) {
  return records.filter((record) => {
    const key = dateKey(record.time, timeZone);
    if (since && key < since) return false;
    if (until && key > until) return false;
    return true;
  });
}

function summarizeBy(records, keyFn, options) {
  const costEnabled = options.costEnabled === true;
  const groups = new Map();
  for (const record of records) {
    const key = keyFn(record);
    const group = groups.get(key) ?? {
      key,
      sessionIds: new Set(),
      modelNames: new Set(),
      workspaces: new Set(),
      agentIds: new Set(),
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      costComplete: costEnabled ? true : null,
      missingPricingModels: new Set(),
      modelBreakdowns: new Map(),
    };
    group.sessionIds.add(record.sessionId);
    group.modelNames.add(record.model);
    if (record.workspace) group.workspaces.add(record.workspace);
    if (record.agentId) group.agentIds.add(record.agentId);
    group.inputTokens += record.inputTokens;
    group.outputTokens += record.outputTokens;
    group.cacheReadTokens += record.cacheReadTokens;
    group.cacheCreationTokens += record.cacheCreationTokens;
    group.totalTokens += record.totalTokens;
    addCost(group, record, costEnabled);
    addModelBreakdown(group.modelBreakdowns, record, costEnabled);
    groups.set(key, group);
  }

  return Array.from(groups.values())
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((group) => ({
      key: group.key,
      sessions: group.sessionIds.size,
      models: Array.from(group.modelNames).sort(),
      workspaces: Array.from(group.workspaces).sort(),
      agentIds: Array.from(group.agentIds).sort(),
      inputTokens: group.inputTokens,
      outputTokens: group.outputTokens,
      cacheReadTokens: group.cacheReadTokens,
      cacheCreationTokens: group.cacheCreationTokens,
      totalTokens: group.totalTokens,
      costUsd: costEnabled && group.costComplete ? precise(group.costUsd) : null,
      costComplete: group.costComplete,
      missingPricingModels: Array.from(group.missingPricingModels).sort(),
      modelBreakdowns: Array.from(group.modelBreakdowns.values())
        .map(finalizeBreakdown)
        .sort((a, b) => a.model.localeCompare(b.model)),
    }));
}

function addModelBreakdown(modelBreakdowns, record, costEnabled) {
  const breakdown = modelBreakdowns.get(record.model) ?? {
    model: record.model,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    costComplete: costEnabled ? true : null,
    missingPricingModels: new Set(),
  };
  breakdown.inputTokens += record.inputTokens;
  breakdown.outputTokens += record.outputTokens;
  breakdown.cacheReadTokens += record.cacheReadTokens;
  breakdown.cacheCreationTokens += record.cacheCreationTokens;
  breakdown.totalTokens += record.totalTokens;
  addCost(breakdown, record, costEnabled);
  modelBreakdowns.set(record.model, breakdown);
}

function addCost(target, record, costEnabled) {
  if (!costEnabled) return;
  if (record.cost === null || record.cost === undefined) {
    target.costComplete = false;
    target.missingPricingModels.add(record.model);
    return;
  }
  target.costUsd += record.cost.totalUsd;
}

function finalizeBreakdown(breakdown) {
  return {
    ...breakdown,
    costUsd: breakdown.costComplete ? precise(breakdown.costUsd) : null,
    missingPricingModels: Array.from(breakdown.missingPricingModels).sort(),
  };
}

function precise(value) {
  return Number(value.toPrecision(15));
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
