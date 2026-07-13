import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BUILTIN_EXCHANGE_RATES,
  createCurrencyContext,
  normalizeCurrencyCode,
  validateExchangeRates,
} from '../src/currency.js';

test('uses the built-in ECB CNY snapshot by default', () => {
  const context = createCurrencyContext();

  assert.equal(context.displayCurrency, 'CNY');
  assert.deepEqual(context.exchangeRate, BUILTIN_EXCHANGE_RATES.CNY);
  assert.equal(context.fromUsd(1), 6.7745407);
  assert.equal(context.toUsd(6.7745407, 'CNY'), 1);
  assert.equal(context.formatUsd(0.026685), '¥0.181');
});

test('supports configured ISO currencies', () => {
  const context = createCurrencyContext({
    displayCurrency: 'eur',
    exchangeRates: {
      eur: { perUsd: 0.86, asOf: '2026-07-13', source: 'manual' },
    },
  });

  assert.equal(normalizeCurrencyCode('eur'), 'EUR');
  assert.equal(context.displayCurrency, 'EUR');
  assert.equal(context.fromUsd(2), 1.72);
  assert.equal(context.toUsd(1.72, 'EUR'), 2);
  assert.match(context.formatUsd(2), /€1\.72/);
});

test('rejects invalid currency settings', () => {
  assert.throws(() => normalizeCurrencyCode('CN'), /Invalid currency code: CN/);
  assert.throws(
    () => validateExchangeRates({ CNY: { perUsd: 0 } }),
    /Invalid exchange rate for CNY: perUsd/,
  );
  assert.throws(
    () => validateExchangeRates({ USD: { perUsd: 2 } }),
    /USD exchange rate must be 1/,
  );
  assert.throws(
    () => validateExchangeRates({ CNY: { perUsd: 7, asOf: '2026-02-30' } }),
    /Invalid exchange rate for CNY: asOf/,
  );
  assert.throws(
    () => createCurrencyContext({ displayCurrency: 'EUR' }),
    /Missing exchange rate for EUR/,
  );
});
