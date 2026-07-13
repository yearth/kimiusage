import test from 'node:test';
import assert from 'node:assert/strict';

import { filterRecords, summarizeDaily, summarizeSessions } from '../src/summary.js';

function record(overrides = {}) {
  return {
    id: 'record',
    source: 'kimi-code',
    workspace: 'workspace-a',
    sessionId: 'session-a',
    agentId: 'main',
    time: Date.parse('2026-01-02T00:00:00.000Z'),
    model: 'kimi-for-coding',
    inputTokens: 1,
    outputTokens: 2,
    cacheReadTokens: 3,
    cacheCreationTokens: 4,
    totalTokens: 10,
    cost: {
      totalUsd: 0.01,
      inputUsd: 0.001,
      outputUsd: 0.002,
      cacheReadUsd: 0.003,
      cacheCreationUsd: 0.004,
      pricingModel: 'moonshot/kimi-k2.5',
    },
    ...overrides,
  };
}

test('filters inclusive dates in the configured timezone', () => {
  const records = [
    record({ id: 'before', time: Date.parse('2026-01-01T15:59:59.999Z') }),
    record({ id: 'inside-a', time: Date.parse('2026-01-01T16:00:00.000Z') }),
    record({ id: 'inside-b', time: Date.parse('2026-01-02T15:59:59.999Z') }),
    record({ id: 'after', time: Date.parse('2026-01-02T16:00:00.000Z') }),
  ];

  const filtered = filterRecords(records, {
    since: '2026-01-02',
    until: '2026-01-02',
    timeZone: 'Asia/Shanghai',
  });

  assert.deepEqual(filtered.map((item) => item.id), ['inside-a', 'inside-b']);
});

test('marks mixed priced and unpriced aggregates as incomplete', () => {
  const rows = summarizeDaily([
    record(),
    record({
      id: 'unknown',
      sessionId: 'session-b',
      agentId: 'reviewer',
      model: 'mcli/glm-5.2',
      cost: null,
    }),
  ], { timeZone: 'UTC', costEnabled: true });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].costUsd, null);
  assert.equal(rows[0].costComplete, false);
  assert.deepEqual(rows[0].missingPricingModels, ['mcli/glm-5.2']);
  assert.deepEqual(rows[0].workspaces, ['workspace-a']);
  assert.deepEqual(rows[0].agentIds, ['main', 'reviewer']);
});

test('sums complete costs and preserves session metadata', () => {
  const daily = summarizeDaily([
    record(),
    record({ id: 'second', cost: { ...record().cost, totalUsd: 0.02 } }),
  ], { timeZone: 'UTC', costEnabled: true });
  const sessions = summarizeSessions([
    record(),
    record({ id: 'reviewer', agentId: 'reviewer' }),
  ], { costEnabled: true });

  assert.equal(daily[0].costUsd, 0.03);
  assert.equal(daily[0].costComplete, true);
  assert.deepEqual(daily[0].missingPricingModels, []);
  assert.deepEqual(sessions[0].workspaces, ['workspace-a']);
  assert.deepEqual(sessions[0].agentIds, ['main', 'reviewer']);
});

test('keeps stable null cost fields when cost calculation is disabled', () => {
  const [row] = summarizeDaily([record({ cost: null })], {
    timeZone: 'UTC',
    costEnabled: false,
  });

  assert.equal(row.costUsd, null);
  assert.equal(row.costComplete, null);
  assert.deepEqual(row.missingPricingModels, []);
});
