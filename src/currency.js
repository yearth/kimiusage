export const DEFAULT_CURRENCY = 'CNY';

export const BUILTIN_EXCHANGE_RATES = Object.freeze({
  USD: Object.freeze({ perUsd: 1, asOf: null, source: 'built-in' }),
  CNY: Object.freeze({
    perUsd: 6.7745407,
    asOf: '2026-07-10',
    source: 'ECB reference rates',
  }),
});

export function normalizeCurrencyCode(value) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!/^[A-Z]{3}$/.test(code)) throw new Error(`Invalid currency code: ${value}`);
  return code;
}

export function validateExchangeRates(value) {
  if (value === undefined) return {};
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid exchange rates config');
  }

  const result = {};
  for (const [rawCode, rawRate] of Object.entries(value)) {
    const code = normalizeCurrencyCode(rawCode);
    if (
      rawRate === null
      || typeof rawRate !== 'object'
      || Array.isArray(rawRate)
      || typeof rawRate.perUsd !== 'number'
      || !Number.isFinite(rawRate.perUsd)
      || rawRate.perUsd <= 0
    ) {
      throw new Error(`Invalid exchange rate for ${code}: perUsd`);
    }
    if (code === 'USD' && rawRate.perUsd !== 1) {
      throw new Error('USD exchange rate must be 1');
    }
    if (rawRate.asOf !== undefined && !isIsoDate(rawRate.asOf)) {
      throw new Error(`Invalid exchange rate for ${code}: asOf`);
    }
    result[code] = {
      perUsd: rawRate.perUsd,
      asOf: rawRate.asOf ?? null,
      source: typeof rawRate.source === 'string' ? rawRate.source : 'config',
    };
  }
  return result;
}

export function createCurrencyContext({
  displayCurrency = DEFAULT_CURRENCY,
  exchangeRates = {},
} = {}) {
  const rates = {
    ...BUILTIN_EXCHANGE_RATES,
    ...validateExchangeRates(exchangeRates),
  };
  const display = normalizeCurrencyCode(displayCurrency);
  const rateFor = (rawCode) => {
    const code = normalizeCurrencyCode(rawCode);
    if (!rates[code]) throw new Error(`Missing exchange rate for ${code}`);
    return rates[code];
  };
  const fromUsd = (amount, code = display) => precise(amount * rateFor(code).perUsd);
  const toUsd = (amount, code = 'USD') => precise(amount / rateFor(code).perUsd);

  rateFor(display);
  return {
    displayCurrency: display,
    exchangeRate: rates[display],
    fromUsd,
    toUsd,
    hasCurrency(code) {
      try {
        return Boolean(rates[normalizeCurrencyCode(code)]);
      } catch {
        return false;
      }
    },
    formatUsd(amount) {
      const converted = fromUsd(amount);
      const digits = converted >= 1 ? 2 : converted >= 0.1 ? 3 : 6;
      const symbol = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: display,
        currencyDisplay: 'narrowSymbol',
        maximumFractionDigits: 0,
      }).formatToParts(0).find((part) => part.type === 'currency')?.value ?? display;
      return `${symbol}${converted.toFixed(digits)}`;
    },
  };
}

function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function precise(value) {
  return Number(value.toPrecision(15));
}
