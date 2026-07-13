import test from 'node:test';
import assert from 'node:assert/strict';

import {
  K2_6_CUTOFF_MS,
  priceRecord,
  resolvePricingModel,
  validatePricingConfig,
} from '../src/pricing.js';

function usageRecord(overrides = {}) {
  return {
    time: K2_6_CUTOFF_MS,
    model: 'kimi-for-coding',
    inputTokens: 1,
    outputTokens: 1,
    cacheReadTokens: 1,
    cacheCreationTokens: 1,
    totalTokens: 4,
    ...overrides,
  };
}

test('maps kimi-for-coding to K2.5 or K2.6 by timestamp', () => {
  assert.equal(
    resolvePricingModel('kimi-for-coding', K2_6_CUTOFF_MS - 1),
    'moonshot/kimi-k2.5',
  );
  assert.equal(
    resolvePricingModel('kimi-for-coding', K2_6_CUTOFF_MS),
    'moonshot/kimi-k2.6',
  );
});

test('calculates K2.6 token category costs', () => {
  assert.deepEqual(priceRecord(usageRecord(), {}), {
    totalUsd: 0.0000062975,
    inputUsd: 0.00000095,
    outputUsd: 0.000004,
    cacheReadUsd: 0.00000016,
    cacheCreationUsd: 0.0000011875,
    pricingModel: 'moonshot/kimi-k2.6',
  });
});

test('uses explicit pricing for routed models and returns null when unknown', () => {
  const routed = usageRecord({ model: 'mcli/glm-5.2' });

  assert.equal(priceRecord(routed, {}), null);
  assert.equal(
    priceRecord(routed, {
      'mcli/glm-5.2': {
        input: 1,
        output: 2,
        cacheRead: 0.1,
        cacheCreation: 1.25,
      },
    }).totalUsd,
    0.00000435,
  );
});

test('does not report a complete price for unclassified total tokens', () => {
  assert.equal(priceRecord(usageRecord({ extraTokens: 1 }), {}), null);
});

test('validates all pricing fields', () => {
  const valid = {
    'mcli/glm-5.2': {
      input: 1,
      output: 2,
      cacheRead: 0.1,
      cacheCreation: 1.25,
    },
  };

  assert.deepEqual(validatePricingConfig(valid), valid);
  assert.throws(
    () => validatePricingConfig({ broken: { input: -1 } }),
    /Invalid pricing for broken: input/,
  );
  assert.throws(
    () => validatePricingConfig({ broken: { input: 1, output: 2 } }),
    /Invalid pricing for broken: cacheRead/,
  );
});
