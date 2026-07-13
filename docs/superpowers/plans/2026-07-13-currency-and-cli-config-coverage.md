# kimiusage 多币种显示与 CLI/配置测试补强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 先补齐 CLI/config 的高价值测试边界，再让 kimiusage 保留 `costUsd` 的同时默认以 CNY 显示，并支持用户配置其他币种和模型原始价格币种。

**Architecture:** 新增 `src/currency.js`，使用“目标币种/1 USD”的快照负责校验、转换和格式化；pricing 先按原始币种计价并归一化为 USD，summary 继续聚合 USD，render 最后转换为显示币种。普通命令不联网，内置 ECB CNY 快照兜底，用户配置优先。

**Tech Stack:** Node.js >=20、ES modules、Node 内置 test runner、`Intl.NumberFormat`、无第三方依赖。

## Global Constraints

- 默认显示 `CNY`，内部规范金额继续使用 `costUsd`。
- 普通命令完全离线，不新增运行时价格或汇率请求。
- 内置 CNY 汇率为 `6.7745407`，日期 `2026-07-10`，来源 `ECB reference rates`。
- 旧 pricing 没有 `currency` 时按 `USD`；配置覆盖内置汇率和价格。
- 缺失价格、汇率或不可分类 Token 时不得输出部分费用。
- 现有 JSON 字段不删除，只增加 `displayCurrency`、`exchangeRate` 和 `cost`。
- 不新增依赖，不做无关重构；采用 TDD 和小提交。
- 最终 `src/cli.js` 行覆盖率 >=90%、`src/config.js` 行覆盖率 >=95%，两者分支覆盖率 >=80%。

## 文件职责

- Create `src/currency.js`：汇率、校验、转换、格式化。
- Modify `src/pricing.js`：原始币种价格归一化为 USD。
- Modify `src/config.js`：货币、汇率和 pricing currency 配置。
- Modify `src/cli.js`：构造 currency context。
- Modify `src/render.js`：表格币种和 JSON 双金额。
- Create `test/cli.test.js`, `test/config.test.js`, `test/currency.test.js`。
- Modify `test/pricing.test.js`, `test/p0.test.js`, `README.md`。

---

### Task 1: 先补 CLI 与配置边界测试

**Files:**
- Create: `test/cli.test.js`
- Create: `test/config.test.js`

**Interfaces:**
- Consumes: `parseArgs`, `runCli`, `discoverConfig`, `loadConfig`, `applyConfig`
- Produces: 当前公开边界的 characterization tests。

- [ ] **Step 1: 写 CLI characterization tests**

`test/cli.test.js` 必须包含以下完整场景：

```js
test('parses public report options and explicit markers', () => {
  const value = parseArgs(['monthly', '--json', '--compact', '--breakdown',
    '--since', '2026-01-01', '--until', '2026-01-31',
    '--timezone', 'Asia/Shanghai', '--offline']);
  assert.deepEqual({
    command: value.command, json: value.json, compact: value.compact,
    breakdown: value.breakdown, since: value.since, until: value.until,
    timeZone: value.timeZone, jsonExplicit: value.jsonExplicit,
    compactExplicit: value.compactExplicit,
    breakdownExplicit: value.breakdownExplicit,
    timeZoneExplicit: value.timeZoneExplicit,
  }, {
    command: 'monthly', json: true, compact: true, breakdown: true,
    since: '2026-01-01', until: '2026-01-31', timeZone: 'Asia/Shanghai',
    jsonExplicit: true, compactExplicit: true,
    breakdownExplicit: true, timeZoneExplicit: true,
  });
});

test('renders help without scanning data', async () => {
  const result = await runCli(['--help'], {});
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /--no-cost/);
  assert.equal(result.stderr, '');
});

test('routes monthly and session table labels', async () => {
  const missing = join(tmpdir(), `kimiusage-missing-${Date.now()}`);
  assert.match((await runCli(['monthly', '--data-dir', missing, '--no-cost'], {})).stdout, /^Month\s+/);
  assert.match((await runCli(['session', '--data-dir', missing, '--no-cost'], {})).stdout, /^Session\s+/);
});

test('rejects invalid CLI input', () => {
  assert.throws(() => parseArgs(['yearly']), /Unknown command: yearly/);
  assert.throws(() => parseArgs(['daily', '--wat']), /Unknown option: --wat/);
  assert.throws(() => parseArgs(['daily', '--since']), /Missing value for --since/);
  assert.throws(() => parseArgs(['daily', '--timezone', '--json']), /Missing value for --timezone/);
});
```

- [ ] **Step 2: 写配置 characterization tests**

`test/config.test.js` 使用 `mkdtemp`，验证：

```js
assert.equal(await discoverConfig({ KIMIUSAGE_CONFIG: explicit, HOME: home }), explicit);
await unlink(explicit);
assert.equal(await discoverConfig({ KIMIUSAGE_CONFIG: explicit, HOME: home }), xdg);
await unlink(xdg);
assert.equal(await discoverConfig({ HOME: home }), legacy);
assert.equal(await discoverConfig({}), null);

await writeFile(invalid, '[]');
await assert.rejects(() => loadConfig(invalid), /Invalid config file:/);

const merged = applyConfig(parseArgs(['weekly', '--json', '--timezone', 'UTC']), {
  defaults: { json: false, compact: true, breakdown: true,
    timezone: 'Asia/Shanghai', dataDir: '/tmp/a,/tmp/b' },
  commands: { weekly: { compact: false, timeZone: 'Europe/Berlin', startOfWeek: 'monday' } },
});
assert.deepEqual({
  json: merged.json, compact: merged.compact, breakdown: merged.breakdown,
  timeZone: merged.timeZone, startOfWeek: merged.startOfWeek, dataDirs: merged.dataDirs,
}, {
  json: true, compact: false, breakdown: true, timeZone: 'UTC',
  startOfWeek: 'monday', dataDirs: ['/tmp/a', '/tmp/b'],
});
```

- [ ] **Step 3: 运行并提交**

Run:

```sh
node --test test/cli.test.js test/config.test.js
npm test
```

Expected: 新增 7 个测试 PASS，全量达到 33/33 PASS。

```sh
git add test/cli.test.js test/config.test.js
git commit -m "test: cover CLI and config boundaries"
```

---

### Task 2: 新增独立货币模块

**Files:**
- Create: `src/currency.js`
- Create: `test/currency.test.js`

**Interfaces:**
- Produces: `DEFAULT_CURRENCY`, `BUILTIN_EXCHANGE_RATES`, `normalizeCurrencyCode`, `validateExchangeRates`, `createCurrencyContext`
- Context shape: `{ displayCurrency, exchangeRate, hasCurrency, toUsd, fromUsd, formatUsd }`。

- [ ] **Step 1: 写失败测试**

```js
test('uses the built-in ECB CNY snapshot by default', () => {
  const context = createCurrencyContext();
  assert.equal(context.displayCurrency, 'CNY');
  assert.deepEqual(context.exchangeRate, BUILTIN_EXCHANGE_RATES.CNY);
  assert.equal(context.fromUsd(1), 6.7745407);
  assert.equal(context.toUsd(6.7745407, 'CNY'), 1);
  assert.equal(context.formatUsd(0.026685), '¥0.181');
});

test('supports configured ISO currencies', () => {
  const context = createCurrencyContext({ displayCurrency: 'eur',
    exchangeRates: { eur: { perUsd: 0.86, asOf: '2026-07-13', source: 'manual' } } });
  assert.equal(context.displayCurrency, 'EUR');
  assert.equal(context.fromUsd(2), 1.72);
  assert.equal(context.toUsd(1.72, 'EUR'), 2);
  assert.match(context.formatUsd(2), /€1\.72/);
});

test('rejects invalid currency settings', () => {
  assert.throws(() => normalizeCurrencyCode('CN'), /Invalid currency code: CN/);
  assert.throws(() => validateExchangeRates({ CNY: { perUsd: 0 } }),
    /Invalid exchange rate for CNY: perUsd/);
  assert.throws(() => validateExchangeRates({ USD: { perUsd: 2 } }),
    /USD exchange rate must be 1/);
  assert.throws(() => createCurrencyContext({ displayCurrency: 'EUR' }),
    /Missing exchange rate for EUR/);
});
```

- [ ] **Step 2: 运行确认 RED**

Run: `node --test test/currency.test.js`

Expected: `ERR_MODULE_NOT_FOUND` for `src/currency.js`。

- [ ] **Step 3: 实现 currency API**

```js
export const DEFAULT_CURRENCY = 'CNY';
export const BUILTIN_EXCHANGE_RATES = Object.freeze({
  USD: Object.freeze({ perUsd: 1, asOf: null, source: 'built-in' }),
  CNY: Object.freeze({ perUsd: 6.7745407, asOf: '2026-07-10', source: 'ECB reference rates' }),
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
    if (rawRate === null || typeof rawRate !== 'object' || Array.isArray(rawRate)
      || typeof rawRate.perUsd !== 'number' || !Number.isFinite(rawRate.perUsd)
      || rawRate.perUsd <= 0) {
      throw new Error(`Invalid exchange rate for ${code}: perUsd`);
    }
    if (code === 'USD' && rawRate.perUsd !== 1) throw new Error('USD exchange rate must be 1');
    if (rawRate.asOf !== undefined && !isIsoDate(rawRate.asOf)) {
      throw new Error(`Invalid exchange rate for ${code}: asOf`);
    }
    result[code] = { perUsd: rawRate.perUsd, asOf: rawRate.asOf ?? null,
      source: typeof rawRate.source === 'string' ? rawRate.source : 'config' };
  }
  return result;
}

export function createCurrencyContext({ displayCurrency = DEFAULT_CURRENCY,
  exchangeRates = {} } = {}) {
  const rates = { ...BUILTIN_EXCHANGE_RATES, ...validateExchangeRates(exchangeRates) };
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
    displayCurrency: display, exchangeRate: rates[display], fromUsd, toUsd,
    hasCurrency: (code) => {
      try { return Boolean(rates[normalizeCurrencyCode(code)]); } catch { return false; }
    },
    formatUsd(amount) {
      const converted = fromUsd(amount);
      const digits = converted >= 1 ? 2 : converted >= 0.1 ? 3 : 6;
      const symbol = new Intl.NumberFormat('en-US', { style: 'currency', currency: display,
        currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 })
        .formatToParts(0).find((part) => part.type === 'currency')?.value ?? display;
      return `${symbol}${converted.toFixed(digits)}`;
    },
  };
}
```

同时实现 `isIsoDate` 的严格日历校验和 `precise(value) = Number(value.toPrecision(15))`。

- [ ] **Step 4: 运行并提交**

```sh
node --test test/currency.test.js
npm test
git add src/currency.js test/currency.test.js
git commit -m "feat: add offline currency conversion"
```

Expected: 全部 PASS。

---

### Task 3: 配置和 pricing 支持原始币种

**Files:**
- Modify: `src/config.js`, `src/pricing.js`
- Modify: `test/config.test.js`, `test/pricing.test.js`

**Interfaces:**
- Produces: `priceRecord(record, overrides, currencyContext)`；返回字段仍为 USD，并增加 `pricingCurrency`。

- [ ] **Step 1: 写失败测试**

```js
const context = createCurrencyContext();
const cost = priceRecord(usageRecord({ inputTokens: 1, outputTokens: 0,
  cacheReadTokens: 0, cacheCreationTokens: 0 }), {
  'kimi-for-coding': { currency: 'CNY', input: 6.7745407,
    output: 0, cacheRead: 0, cacheCreation: 0 },
}, context);
assert.equal(cost.inputUsd, 0.000001);
assert.equal(cost.totalUsd, 0.000001);
assert.equal(cost.pricingCurrency, 'CNY');
```

配置测试写入 `defaults.currency: 'eur'`、EUR 汇率和 EUR pricing，断言加载后均规范为 `EUR`；另断言未配置 GBP 汇率时抛出 `Missing exchange rate for GBP`。现有 pricing 验证期望增加默认 `currency: 'USD'`。

- [ ] **Step 2: 运行确认 RED**

Run: `node --test test/pricing.test.js test/config.test.js`

Expected: currency 字段和 USD 归一化断言失败。

- [ ] **Step 3: 修改 pricing**

- 内置 K2.5/K2.6 条目增加 `currency: 'USD'`。
- `validatePricingConfig` 对可选 currency 调用 `normalizeCurrencyCode`，默认 USD；非法时抛出 `Invalid pricing for <model>: currency`。
- `priceRecord` 默认创建 USD context；使用 `resolved.pricing.currency ?? 'USD'`。
- 四类原始费用分别调用 `currencyContext.toUsd(rawCost, pricingCurrency)`；返回增加 `pricingCurrency`。
- 模型候选顺序、`extraTokens` 和完整性语义不改变。

- [ ] **Step 4: 修改 config**

`loadConfig` 执行：

```js
parsed.exchangeRates = validateExchangeRates(parsed.exchangeRates);
parsed.pricing = validatePricingConfig(parsed.pricing);
const context = createCurrencyContext({
  displayCurrency: parsed.defaults?.currency ?? DEFAULT_CURRENCY,
  exchangeRates: parsed.exchangeRates,
});
for (const pricing of Object.values(parsed.pricing)) {
  if (!context.hasCurrency(pricing.currency)) {
    throw new Error(`Missing exchange rate for ${pricing.currency}`);
  }
}
```

`applyConfig` 返回规范化 `currency`、顶层 `exchangeRates` 和 `pricing`；只有 `defaults.currency` 控制显示币种。

- [ ] **Step 5: 运行并提交**

```sh
node --test test/currency.test.js test/pricing.test.js test/config.test.js
npm test
git add src/config.js src/pricing.js test/config.test.js test/pricing.test.js
git commit -m "feat: support source currencies in pricing"
```

Expected: 全部 PASS。

---

### Task 4: CLI、表格和 JSON 显示金额

**Files:**
- Modify: `src/cli.js`, `src/render.js`
- Modify: `test/p0.test.js`, `test/cli.test.js`

**Interfaces:**
- Produces: `Cost (CNY)`；JSON 顶层 currency 元数据和 row/breakdown/totals `cost`。

- [ ] **Step 1: 写失败测试**

```js
const table = await runCli(['daily', '--data-dir', root], { HOME: root });
assert.match(table.stdout, /Cost \(CNY\)/);
assert.match(table.stdout, /¥/);
const report = JSON.parse((await runCli(['daily', '--json', '--data-dir', root],
  { HOME: root })).stdout);
assert.equal(report.displayCurrency, 'CNY');
assert.equal(report.exchangeRate.perUsd, 6.7745407);
assert.equal(report.rows[0].cost,
  Number((report.rows[0].costUsd * 6.7745407).toPrecision(15)));
assert.equal(report.totals.cost,
  Number((report.totals.costUsd * 6.7745407).toPrecision(15)));
```

扩展 `--no-cost` 断言 row/totals `cost === null`；增加 USD 配置端到端断言 `Cost (USD)` 和 `$`；breakdown 断言显示 `cost`。

- [ ] **Step 2: 运行确认 RED**

Run: `node --test test/p0.test.js test/cli.test.js`

Expected: 当前没有 CNY 表头和 JSON currency 字段。

- [ ] **Step 3: CLI 接线**

`runCli` 用 `options.currency` 和 `options.exchangeRates` 构造 context，调用 `priceRecord(record, options.pricing, currencyContext)`，并将 context 传给 render。参数解析和 stderr 诊断不改变。

- [ ] **Step 4: render 双金额**

```js
function withDisplayCost(item, currencyContext) {
  return { ...item, cost: item.costUsd === null
    ? null : precise(currencyContext.fromUsd(item.costUsd)) };
}
```

- 表头为 ``Cost (${currencyContext.displayCurrency})``。
- row、breakdown、total 表格费用调用 `currencyContext.formatUsd(costUsd)`；null 为 `N/A`。
- JSON rows、modelBreakdowns、totals 增加 `cost`，顶层增加 `displayCurrency`、`exchangeRate`。
- `--no-cost` 不显示费用列，JSON 双金额均为 null。

- [ ] **Step 5: 运行并提交**

```sh
node --test test/p0.test.js test/cli.test.js test/currency.test.js
npm test
git add src/cli.js src/render.js test/p0.test.js test/cli.test.js
git commit -m "feat: display usage costs in configured currency"
```

Expected: 全部 PASS。

---

### Task 5: 文档、覆盖率与完整验收

**Files:**
- Modify: `README.md`
- Test: all `test/*.test.js`

**Interfaces:**
- Produces: 用户配置说明、覆盖率证据和独立 QA verdict。

- [ ] **Step 1: 更新 README**

明确默认 CNY、`costUsd` 规范金额、`perUsd` 语义、ECB 快照值/日期/URL、pricing 原始币种、旧配置兼容、完全离线和 N/A/null 语义；加入设计文档的 EUR/CNY/pricing 示例及 JSON 新字段。

- [ ] **Step 2: 执行覆盖率门槛**

Run: `node --test --experimental-test-coverage`

Expected: `cli.js` line >=90/branch >=80；`config.js` line >=95/branch >=80。只补缺失的公开边界断言，不追求 100%。

- [ ] **Step 3: 完整验证与真实数据冒烟**

```sh
npm test
node --test --experimental-test-coverage
git diff --check
npm pack --dry-run
node bin/kimiusage.js daily --data-dir "$HOME/.kimi-code,$HOME/.kimi" --since 2026-06-01
node bin/kimiusage.js daily --data-dir "$HOME/.kimi-code,$HOME/.kimi" --since 2026-06-01 --no-cost
```

Expected: 全部 exit 0；默认表格为 `Cost (CNY)`；`--no-cost` 无费用列；pack 包含 `src/currency.js`。

- [ ] **Step 4: 提交文档**

```sh
git add README.md
git commit -m "docs: explain currency-aware cost estimates"
```

- [ ] **Step 5: 独立 QA gate**

QA subagent 只读验证默认 CNY、USD 兼容、原始价格币种、汇率覆盖、缺失价格/汇率、`--no-cost`、JSON 兼容、覆盖率门槛、无网络和工作区洁净度，返回 `PASS`、`FAIL` 或 `NEEDS WORK`。非 PASS 时只修审查范围并复验。
