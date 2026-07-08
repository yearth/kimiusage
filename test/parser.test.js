import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { discoverWireFiles } from '../src/paths.js';
import { loadUsageRecords, parseUsageLine } from '../src/parser.js';
import { summarizeDaily, summarizeMonthly, summarizeSessions } from '../src/summary.js';

async function makeFixture() {
  const root = join(tmpdir(), `kimiusage-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const modernSession = join(
    root,
    '.kimi-code',
    'sessions',
    'wd_project_abcd',
    'session_modern',
    'agents',
    'main',
  );
  await mkdir(modernSession, { recursive: true });
  await writeFile(
    join(modernSession, 'wire.jsonl'),
    [
      JSON.stringify({
        type: 'usage.record',
        time: Date.UTC(2026, 0, 2, 8, 0, 0),
        model: 'kimi-k2',
        usageScope: 'turn',
        usage: {
          inputOther: 100,
          output: 20,
          inputCacheRead: 30,
          inputCacheCreation: 40,
        },
      }),
      JSON.stringify({
        type: 'usage.record',
        time: Date.UTC(2026, 0, 2, 9, 0, 0),
        model: 'kimi-k2',
        usageScope: 'turn',
        usage: {
          inputOther: 10,
          output: 2,
          inputCacheRead: 3,
          inputCacheCreation: 4,
        },
      }),
    ].join('\n') + '\n',
  );

  const legacySession = join(root, '.kimi', 'sessions', 'group-a', 'legacy-session');
  await mkdir(legacySession, { recursive: true });
  await writeFile(
    join(legacySession, 'wire.jsonl'),
    JSON.stringify({
      message: {
        type: 'StatusUpdate',
        payload: {
          token_usage: {
            input_other: 7,
            output: 8,
            input_cache_read: 9,
            input_cache_creation: 10,
          },
        },
      },
      time: Date.UTC(2026, 0, 3, 10, 0, 0),
    }) + '\n',
  );

  return root;
}

test('discovers modern and legacy Kimi wire files', async () => {
  const root = await makeFixture();

  const files = await discoverWireFiles([join(root, '.kimi-code'), join(root, '.kimi')]);

  assert.equal(files.length, 2);
  assert.ok(files.some((file) => file.includes('session_modern')));
  assert.ok(files.some((file) => file.includes('legacy-session')));
});

test('loads usage records from modern and legacy wire files', async () => {
  const root = await makeFixture();
  const files = await discoverWireFiles([join(root, '.kimi-code'), join(root, '.kimi')]);

  const records = await loadUsageRecords(files);

  assert.equal(records.length, 3);
  assert.deepEqual(
    records.map((record) => record.totalTokens),
    [190, 19, 34],
  );
  assert.deepEqual(
    records.map((record) => record.model),
    ['kimi-k2', 'kimi-k2', 'unknown'],
  );
});

test('ignores usage records without a valid timestamp', () => {
  const record = parseUsageLine(JSON.stringify({
    type: 'usage.record',
    model: 'kimi-k2',
    usage: { inputOther: 1, output: 1 },
  }));

  assert.equal(record, null);
});

test('summarizes daily, monthly, and session usage', async () => {
  const root = await makeFixture();
  const records = await loadUsageRecords(
    await discoverWireFiles([join(root, '.kimi-code'), join(root, '.kimi')]),
  );

  assert.deepEqual(summarizeDaily(records), [
    {
      key: '2026-01-02',
      sessions: 1,
      models: ['kimi-k2'],
      inputTokens: 110,
      outputTokens: 22,
      cacheReadTokens: 33,
      cacheCreationTokens: 44,
      totalTokens: 209,
      modelBreakdowns: [
        {
          model: 'kimi-k2',
          inputTokens: 110,
          outputTokens: 22,
          cacheReadTokens: 33,
          cacheCreationTokens: 44,
          totalTokens: 209,
        },
      ],
    },
    {
      key: '2026-01-03',
      sessions: 1,
      models: ['unknown'],
      inputTokens: 7,
      outputTokens: 8,
      cacheReadTokens: 9,
      cacheCreationTokens: 10,
      totalTokens: 34,
      modelBreakdowns: [
        {
          model: 'unknown',
          inputTokens: 7,
          outputTokens: 8,
          cacheReadTokens: 9,
          cacheCreationTokens: 10,
          totalTokens: 34,
        },
      ],
    },
  ]);

  assert.equal(summarizeMonthly(records)[0].key, '2026-01');
  assert.equal(summarizeMonthly(records)[0].totalTokens, 243);
  assert.equal(summarizeSessions(records).length, 2);
});
