export const K2_6_CUTOFF_MS = Date.parse('2026-04-20T15:28:10.072Z');

const TOKENS_PER_MILLION = 1_000_000;
const PRICING_FIELDS = ['input', 'output', 'cacheRead', 'cacheCreation'];
const BUILTIN_PRICING = {
  'moonshot/kimi-k2.5': {
    input: 0.6,
    output: 3,
    cacheRead: 0.1,
    cacheCreation: 0.75,
  },
  'moonshot/kimi-k2.6': {
    input: 0.95,
    output: 4,
    cacheRead: 0.16,
    cacheCreation: 1.1875,
  },
};

export function resolvePricingModel(model, time) {
  if (model === 'kimi-for-coding') {
    return time < K2_6_CUTOFF_MS ? 'moonshot/kimi-k2.5' : 'moonshot/kimi-k2.6';
  }
  return model;
}

export function priceRecord(record, overrides = {}) {
  if (record.extraTokens > 0) return null;

  const resolved = findPricing(record.model, record.time, overrides);
  if (!resolved) return null;

  const inputUsd = calculate(record.inputTokens, resolved.pricing.input);
  const outputUsd = calculate(record.outputTokens, resolved.pricing.output);
  const cacheReadUsd = calculate(record.cacheReadTokens, resolved.pricing.cacheRead);
  const cacheCreationUsd = calculate(
    record.cacheCreationTokens,
    resolved.pricing.cacheCreation,
  );
  return {
    totalUsd: precise(inputUsd + outputUsd + cacheReadUsd + cacheCreationUsd),
    inputUsd,
    outputUsd,
    cacheReadUsd,
    cacheCreationUsd,
    pricingModel: resolved.model,
  };
}

export function validatePricingConfig(value) {
  if (value === undefined) return {};
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid pricing config');
  }

  const validated = {};
  for (const [model, pricing] of Object.entries(value)) {
    if (pricing === null || typeof pricing !== 'object' || Array.isArray(pricing)) {
      throw new Error(`Invalid pricing for ${model}: input`);
    }
    const entry = {};
    for (const field of PRICING_FIELDS) {
      const amount = pricing[field];
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
        throw new Error(`Invalid pricing for ${model}: ${field}`);
      }
      entry[field] = amount;
    }
    validated[model] = entry;
  }
  return validated;
}

function findPricing(model, time, overrides) {
  if (overrides[model]) return { model, pricing: overrides[model] };

  const mappedModel = resolvePricingModel(model, time);
  const candidates = [mappedModel, `moonshot/${model}`, `kimi/${model}`, model];
  for (const candidate of new Set(candidates)) {
    const pricing = overrides[candidate] ?? BUILTIN_PRICING[candidate];
    if (pricing) return { model: candidate, pricing };
  }
  return null;
}

function calculate(tokens, usdPerMillion) {
  return precise((tokens * usdPerMillion) / TOKENS_PER_MILLION);
}

function precise(value) {
  return Number(value.toPrecision(15));
}
