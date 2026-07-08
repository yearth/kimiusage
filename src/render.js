export function renderTable(rows, label = 'Date') {
  const headers = [label, 'Sessions', 'Models', 'Input', 'Output', 'Cache Read', 'Cache Create', 'Total'];
  const body = rows.map((row) => [
    row.key,
    String(row.sessions),
    row.models.join(', '),
    formatNumber(row.inputTokens),
    formatNumber(row.outputTokens),
    formatNumber(row.cacheReadTokens),
    formatNumber(row.cacheCreationTokens),
    formatNumber(row.totalTokens),
  ]);
  const total = totals(rows);
  body.push([
    'Total',
    String(total.sessions),
    total.models.join(', '),
    formatNumber(total.inputTokens),
    formatNumber(total.outputTokens),
    formatNumber(total.cacheReadTokens),
    formatNumber(total.cacheCreationTokens),
    formatNumber(total.totalTokens),
  ]);

  const widths = headers.map((header, index) =>
    Math.max(header.length, ...body.map((row) => row[index].length)),
  );
  return [headers, ...body]
    .map((row) => row.map((cell, index) => cell.padEnd(widths[index])).join('  ').trimEnd())
    .join('\n');
}

export function renderJson(rows) {
  return JSON.stringify({ rows, totals: totals(rows) }, null, 2);
}

export function totals(rows) {
  const modelNames = new Set();
  let sessions = 0;
  const sum = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    totalTokens: 0,
  };
  for (const row of rows) {
    sessions += row.sessions;
    for (const model of row.models) modelNames.add(model);
    sum.inputTokens += row.inputTokens;
    sum.outputTokens += row.outputTokens;
    sum.cacheReadTokens += row.cacheReadTokens;
    sum.cacheCreationTokens += row.cacheCreationTokens;
    sum.totalTokens += row.totalTokens;
  }
  return { sessions, models: Array.from(modelNames).sort(), ...sum };
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value);
}
