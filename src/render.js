export function renderTable(rows, label = 'Date', options = {}) {
  const headers = options.compact
    ? [label, 'Sessions', 'Models', 'Total']
    : [label, 'Sessions', 'Models', 'Input', 'Output', 'Cache Read', 'Cache Create', 'Total'];
  const body = rows.map((row) => summaryRow(row, options.compact));
  if (options.breakdown) addBreakdownRows(body, rows, options.compact);
  const total = totals(rows);
  body.push(totalRow(total, options.compact));

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

function summaryRow(row, compact) {
  if (compact) {
    return [
      row.key,
      String(row.sessions),
      row.models.join(', '),
      formatNumber(row.totalTokens),
    ];
  }
  return [
    row.key,
    String(row.sessions),
    row.models.join(', '),
    formatNumber(row.inputTokens),
    formatNumber(row.outputTokens),
    formatNumber(row.cacheReadTokens),
    formatNumber(row.cacheCreationTokens),
    formatNumber(row.totalTokens),
  ];
}

function addBreakdownRows(body, rows, compact) {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const breakdowns = rows[index].modelBreakdowns ?? [];
    for (let childIndex = breakdowns.length - 1; childIndex >= 0; childIndex -= 1) {
      const item = breakdowns[childIndex];
      body.splice(index + 1, 0, breakdownRow(item, compact));
    }
  }
}

function breakdownRow(item, compact) {
  if (compact) {
    return [`  ${item.model}`, '', '', formatNumber(item.totalTokens)];
  }
  return [
    `  ${item.model}`,
    '',
    '',
    formatNumber(item.inputTokens),
    formatNumber(item.outputTokens),
    formatNumber(item.cacheReadTokens),
    formatNumber(item.cacheCreationTokens),
    formatNumber(item.totalTokens),
  ];
}

function totalRow(total, compact) {
  if (compact) {
    return [
      'Total',
      String(total.sessions),
      total.models.join(', '),
      formatNumber(total.totalTokens),
    ];
  }
  return [
    'Total',
    String(total.sessions),
    total.models.join(', '),
    formatNumber(total.inputTokens),
    formatNumber(total.outputTokens),
    formatNumber(total.cacheReadTokens),
    formatNumber(total.cacheCreationTokens),
    formatNumber(total.totalTokens),
  ];
}
