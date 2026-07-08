import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { runCli } from '../src/cli.js';
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
  const output = await runCli(
    ['weekly', '--json', '--data-dir', join(root, '.kimi-code'), '--start-of-week', 'monday'],
    { HOME: root },
  );
  const report = JSON.parse(output);

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
    },
    {
      model: 'moonshot-v1',
      inputTokens: 1,
      outputTokens: 2,
      cacheReadTokens: 3,
      cacheCreationTokens: 4,
      totalTokens: 10,
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

  const output = await runCli(['weekly', '--config', configPath], { HOME: root });
  const report = JSON.parse(output);

  assert.deepEqual(
    report.rows.map((row) => ({ key: row.key, totalTokens: row.totalTokens })),
    [
      { key: '2026-01-05', totalTokens: 100 },
      { key: '2026-01-12', totalTokens: 10 },
    ],
  );
});

async function makeFixture() {
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
        time,
        model: 'kimi-k2',
        usage: { inputOther: total, output: 0, inputCacheRead: 0, inputCacheCreation: 0 },
      })}\n`,
    );
  }
  return root;
}
