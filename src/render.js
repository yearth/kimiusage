export function renderTable(rows, label = 'Date', options = {}) {
  const headers = options.compact
    ? [label, 'Sessions', 'Models', 'Total']
    : [label, 'Sessions', 'Models', 'Input', 'Output', 'Cache Read', 'Cache Create', 'Total'];
  if (options.costEnabled) headers.push('Cost');
  const body = rows.map((row) => summaryRow(row, options));
  if (options.breakdown) addBreakdownRows(body, rows, options);
  const total = totals(rows);
  body.push(totalRow(total, options));

  const widths = headers.map((header, index) =>
    Math.max(header.length, ...body.map((row) => row[index].length)),
  );
  return [headers, ...body]
    .map((row) => row.map((cell, index) => cell.padEnd(widths[index])).join('  ').trimEnd())
    .join('\n');
}

export function renderJson(rows, context = {}) {
  const total = totals(rows);
  return JSON.stringify({
    command: context.command ?? 'daily',
    timezone: context.timezone ?? 'UTC',
    costCalculation: context.costEnabled === false ? 'disabled' : 'enabled',
    rows,
    totals: total,
    missingPricingModels: context.costEnabled === false ? [] : total.missingPricingModels,
  }, null, 2);
}

export function totals(rows) {
  const modelNames = new Set();
  const missingPricingModels = new Set();
  let sessions = 0;
  let costUsd = 0;
  let costComplete = rows.length > 0 ? true : null;
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
    for (const model of row.missingPricingModels ?? []) missingPricingModels.add(model);
    sum.inputTokens += row.inputTokens;
    sum.outputTokens += row.outputTokens;
    sum.cacheReadTokens += row.cacheReadTokens;
    sum.cacheCreationTokens += row.cacheCreationTokens;
    sum.totalTokens += row.totalTokens;
    if (row.costComplete === null) {
      costComplete = null;
    } else if (row.costComplete === false) {
      costComplete = false;
    } else if (costComplete !== false && costComplete !== null) {
      costUsd += row.costUsd;
    }
  }
  return {
    sessions,
    models: Array.from(modelNames).sort(),
    ...sum,
    costUsd: costComplete === true ? precise(costUsd) : null,
    costComplete,
    missingPricingModels: Array.from(missingPricingModels).sort(),
  };
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

function summaryRow(row, options) {
  let cells;
  if (options.compact) {
    cells = [
      row.key,
      String(row.sessions),
      row.models.join(', '),
      formatNumber(row.totalTokens),
    ];
  } else {
    cells = [
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
  if (options.costEnabled) cells.push(formatCost(row.costUsd));
  return cells;
}

function addBreakdownRows(body, rows, options) {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const breakdowns = rows[index].modelBreakdowns ?? [];
    for (let childIndex = breakdowns.length - 1; childIndex >= 0; childIndex -= 1) {
      const item = breakdowns[childIndex];
      body.splice(index + 1, 0, breakdownRow(item, options));
    }
  }
}

function breakdownRow(item, options) {
  let cells;
  if (options.compact) {
    cells = [`  ${item.model}`, '', '', formatNumber(item.totalTokens)];
  } else {
    cells = [
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
  if (options.costEnabled) cells.push(formatCost(item.costUsd));
  return cells;
}

function totalRow(total, options) {
  let cells;
  if (options.compact) {
    cells = [
      'Total',
      String(total.sessions),
      total.models.join(', '),
      formatNumber(total.totalTokens),
    ];
  } else {
    cells = [
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
  if (options.costEnabled) cells.push(formatCost(total.costUsd));
  return cells;
}

function formatCost(value) {
  if (value === null || value === undefined) return 'N/A';
  const digits = value >= 1 ? 2 : value >= 0.1 ? 3 : 6;
  return `$${value.toFixed(digits)}`;
}

function precise(value) {
  return Number(value.toPrecision(15));
}
