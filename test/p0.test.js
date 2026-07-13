import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseArgs, runCli } from '../src/cli.js';
import { applyConfig, loadConfig } from '../src/config.js';
import { summarizeDaily } from '../src/summary.js';
import { renderTable } from '../src/render.js';

const records = [
  {
    sessionId: 'session-a',
    time: Date.UTC(2026, 0, 5, 23, 0, 0),
    model: 'kimi-k2',
    inputTokens: 10,
    outputTokens: 20,
    cacheReadTokens: 30,
    cacheCreationTokens: 40,
    totalTokens: 100,
  },
  {
    sessionId: 'session-b',
    time: Date.UTC(2026, 0, 5, 22, 0, 0),
    model: 'moonshot-v1',
    inputTokens: 1,
    outputTokens: 2,
    cacheReadTokens: 3,
    cacheCreationTokens: 4,
    totalTokens: 10,
  },
  {
    sessionId: 'session-c',
    time: Date.UTC(2026, 0, 12, 1, 0, 0),
    model: 'kimi-k2',
    inputTokens: 5,
    outputTokens: 6,
    cacheReadTokens: 7,
    cacheCreationTokens: 8,
    totalTokens: 26,
  },
];

test('CLI summarizes usage by configurable week start', async () => {
  const root = await makeFixture();
  const result = await runCli(
    ['weekly', '--json', '--data-dir', join(root, '.kimi-code'), '--start-of-week', 'monday'],
    { HOME: root },
  );
  const report = JSON.parse(result.stdout);

  assert.deepEqual(
    report.rows.map((row) => ({ key: row.key, totalTokens: row.totalTokens })),
    [
      { key: '2026-01-05', totalTokens: 100 },
      { key: '2026-01-12', totalTokens: 10 },
    ],
  );
});

test('summaries include per-model breakdowns', () => {
  const [row] = summarizeDaily(records.slice(0, 2), { timeZone: 'UTC' });

  assert.deepEqual(row.modelBreakdowns, [
    {
      model: 'kimi-k2',
      inputTokens: 10,
      outputTokens: 20,
      cacheReadTokens: 30,
      cacheCreationTokens: 40,
      totalTokens: 100,
      costUsd: null,
      costComplete: null,
      missingPricingModels: [],
    },
    {
      model: 'moonshot-v1',
      inputTokens: 1,
      outputTokens: 2,
      cacheReadTokens: 3,
      cacheCreationTokens: 4,
      totalTokens: 10,
      costUsd: null,
      costComplete: null,
      missingPricingModels: [],
    },
  ]);
});

test('compact table omits verbose token columns but keeps totals', () => {
  const table = renderTable(summarizeDaily(records), 'Date', { compact: true });

  assert.match(table, /Date\s+Sessions\s+Models\s+Total/);
  assert.doesNotMatch(table, /Cache Read/);
  assert.match(table, /Total/);
  assert.match(table, /136/);
});

test('CLI applies configuration file defaults and command overrides', async () => {
  const root = await makeFixture();
  const configPath = join(root, 'kimiusage.json');
  await writeFile(
    configPath,
    JSON.stringify({
      defaults: {
        dataDirs: [join(root, '.kimi-code')],
        json: true,
        timezone: 'UTC',
      },
      commands: {
        weekly: {
          startOfWeek: 'monday',
        },
      },
    }),
  );

  const result = await runCli(['weekly', '--config', configPath], { HOME: root });
  const report = JSON.parse(result.stdout);

  assert.deepEqual(
    report.rows.map((row) => ({ key: row.key, totalTokens: row.totalTokens })),
    [
      { key: '2026-01-05', totalTokens: 100 },
      { key: '2026-01-12', totalTokens: 10 },
    ],
  );
});

test('configuration validates and exposes pricing overrides', async () => {
  const root = await makeFixture();
  const configPath = join(root, 'pricing.json');
  const pricing = {
    'mcli/glm-5.2': {
      input: 1,
      output: 2,
      cacheRead: 0.1,
      cacheCreation: 1.25,
    },
  };
  await writeFile(configPath, JSON.stringify({ pricing }));

  const options = applyConfig(parseArgs(['daily']), await loadConfig(configPath));

  assert.deepEqual(options.pricing, pricing);

  await writeFile(configPath, JSON.stringify({ pricing: { broken: { input: -1 } } }));
  await assert.rejects(() => loadConfig(configPath), /Invalid pricing for broken: input/);
});

test('CLI exposes a stable JSON contract and missing pricing diagnostics', async () => {
  const root = await makeFixture('mcli/glm-5.2');

  const result = await runCli(
    ['daily', '--json', '--data-dir', join(root, '.kimi-code')],
    { HOME: root },
  );
  const report = JSON.parse(result.stdout);

  assert.equal(report.command, 'daily');
  assert.equal(report.timezone, 'UTC');
  assert.equal(report.costCalculation, 'enabled');
  assert.equal(report.rows[0].costUsd, null);
  assert.equal(report.totals.costUsd, null);
  assert.deepEqual(report.missingPricingModels, ['mcli/glm-5.2']);
  assert.match(result.stderr, /Missing pricing: mcli\/glm-5\.2/);
});

test('CLI disables pricing cleanly with --no-cost', async () => {
  const root = await makeFixture('mcli/glm-5.2');

  const result = await runCli(
    ['daily', '--json', '--no-cost', '--data-dir', join(root, '.kimi-code')],
    { HOME: root },
  );
  const report = JSON.parse(result.stdout);

  assert.equal(report.costCalculation, 'disabled');
  assert.equal(report.rows[0].costUsd, null);
  assert.equal(report.totals.costUsd, null);
  assert.deepEqual(report.missingPricingModels, []);
  assert.equal(result.stderr, '');
});

test('table shows Cost and N/A for incomplete pricing', () => {
  const rows = summarizeDaily(records, { timeZone: 'UTC', costEnabled: true });
  const table = renderTable(rows, 'Date', { costEnabled: true });

  assert.match(table, /Cost/);
  assert.match(table, /N\/A/);
});

async function makeFixture(model = 'kimi-code/kimi-for-coding') {
  const root = join(tmpdir(), `kimiusage-p0-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  for (const [session, time, total] of [
    ['session-a', Date.UTC(2026, 0, 5, 23, 0, 0), 100],
    ['session-b', Date.UTC(2026, 0, 12, 1, 0, 0), 10],
  ]) {
    const dir = join(root, '.kimi-code', 'sessions', 'wd_project_abcd', session, 'agents', 'main');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'wire.jsonl'),
      `${JSON.stringify({
        type: 'usage.record',
        usageScope: 'turn',
        time,
        model,
        usage: { inputOther: total, output: 0, inputCacheRead: 0, inputCacheCreation: 0 },
      })}\n`,
    );
  }
  return root;
}
