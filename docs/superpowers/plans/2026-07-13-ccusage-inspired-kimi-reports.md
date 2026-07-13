# Kimi Code 用量报告完善实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 将 `kimiusage` 完善为只面向 Kimi Code、兼容旧版 Kimi CLI 的离线 Token 与费用报告工具，并保证解析、去重、定价、聚合和输出均有测试证据。

**架构：** 保留零依赖 Node.js CLI，把当前流程明确拆成日志发现、记录规范化、去重、价格解析、聚合和渲染六个阶段。各阶段通过普通对象传递数据，Kimi Code 是主要数据源，旧 `~/.kimi` 只保留兼容读取，不扩展其他 Agent。

**技术栈：** Node.js 20+、ES Modules、`node:test`、`node:fs/promises`、`Intl.DateTimeFormat`

## 全局约束

- 默认只读取 `~/.kimi-code` 和兼容目录 `~/.kimi`，不得增加其他 Agent 数据源。
- 不增加第三方运行时依赖，不发送网络请求，不读取或输出提示词与回复正文。
- Kimi Code 只统计 `type: "usage.record"` 且 `usageScope: "turn"` 的记录。
- 缺少价格时费用必须为 `null`，不得伪装成 `$0` 或输出不完整的部分合计。
- 所有生产代码变更必须先有失败测试，并亲眼确认 RED 后再写最小实现。
- 每个任务完成后运行对应测试和完整 `npm test`，保持 stdout JSON 纯净。

---

## 文件职责

- `src/paths.js`：默认数据目录、合法 Kimi/Kimi Code wire 路径发现和路径元数据提取。
- `src/parser.js`：逐行解析、Kimi Code/旧 Kimi 规范化、零值过滤和稳定去重。
- `src/pricing.js`：内置 K2.5/K2.6 费率、模型候选匹配、配置覆盖和费用计算。
- `src/config.js`：配置发现、优先级合并和 pricing 配置校验。
- `src/summary.js`：时区日期边界过滤、分组聚合和费用完整性传播。
- `src/render.js`：表格、JSON、Cost/N/A、missing pricing 输出数据构造。
- `src/cli.js`：参数、阶段编排、stderr 诊断返回和最终输出。
- `test/paths.test.js`：合法路径发现与非法嵌套排除。
- `test/parser.test.js`：新旧格式、过滤、规范化、去重和元数据。
- `test/pricing.test.js`：费率切换、覆盖、未知模型和费用计算。
- `test/summary.test.js`：时区边界、费用完整性和 session 元数据。
- `test/p0.test.js`：CLI 表格、JSON、配置、诊断和回归场景。
- `README.md`：功能状态、费用语义、配置示例和隐私边界。

---

### Task 1：修正日志发现、解析与去重

**Files:**
- Create: `test/paths.test.js`
- Modify: `test/parser.test.js`
- Modify: `src/paths.js`
- Modify: `src/parser.js`

**Interfaces:**
- Produces: `discoverWireFiles(dataDirs) -> Promise<string[]>`
- Produces: `metadataFromPath(file) -> { source, rootDir, workspace, sessionId, agentId }`
- Produces: `parseUsageLine(line, file, metadata, legacyModel) -> UsageRecord | null`
- Produces: `loadUsageRecords(files) -> Promise<{ records, diagnostics }>`
- `UsageRecord` fields: `file`, `source`, `workspace`, `sessionId`, `agentId`, `time`, `model`, `messageId`, four Token categories, and `totalTokens`
- [ ] **Step 1：先写受约束路径发现的失败测试**

在 `test/paths.test.js` 创建 fixtures，断言只发现以下两条路径，忽略多一层、少一层和错误文件名：

```js
test('discovers only supported Kimi wire layouts', async () => {
  const root = await makePathFixture();
  const files = await discoverWireFiles([
    join(root, '.kimi-code'),
    join(root, '.kimi'),
  ]);

  assert.deepEqual(files.map((file) => relative(root, file)), [
    '.kimi-code/sessions/ws-a/session-a/agents/main/wire.jsonl',
    '.kimi/sessions/group-a/session-b/wire.jsonl',
  ]);
});
```
- [ ] **Step 2：运行路径测试确认 RED**

Run: `node --test test/paths.test.js`

Expected: FAIL，因为当前递归扫描会包含非法嵌套的 `wire.jsonl`，且 `metadataFromPath` 尚不存在。
- [ ] **Step 3：实现最小路径校验和元数据提取**

在 `src/paths.js` 中只接受相对 `sessions` 目录的两种结构，并导出：

```js
export function metadataFromPath(file) {
  const parts = file.split(sep);
  const sessions = parts.lastIndexOf('sessions');
  const relative = parts.slice(sessions + 1);
  if (relative.length === 5 && relative[2] === 'agents' && relative[4] === 'wire.jsonl') {
    return {
      source: 'kimi-code',
      rootDir: parts.slice(0, sessions).join(sep) || sep,
      workspace: relative[0],
      sessionId: relative[1],
      agentId: relative[3],
    };
  }
  if (relative.length === 3 && relative[2] === 'wire.jsonl') {
    return {
      source: 'kimi',
      rootDir: parts.slice(0, sessions).join(sep) || sep,
      workspace: relative[0],
      sessionId: relative[1],
      agentId: null,
    };
  }
  return null;
}
```

`discoverWireFiles` 在加入结果前调用该函数，最终排序并通过 `Set` 去重。
- [ ] **Step 4：运行路径测试确认 GREEN**

Run: `node --test test/paths.test.js`

Expected: PASS。
- [ ] **Step 5：写 turn/session、零值、模型规范化和去重的失败测试**

在 `test/parser.test.js` 增加一个 Kimi Code 文件，其中包含一条 turn、一条 session 累计、一条零 Token 和一条完全重复的 turn，断言只保留一条：

```js
assert.equal(records.length, 1);
assert.equal(records[0].model, 'kimi-for-coding');
assert.equal(records[0].source, 'kimi-code');
assert.equal(records[0].workspace, 'workspace-a');
assert.equal(records[0].agentId, 'main');
assert.deepEqual(diagnostics, []);
```

再增加以下场景：旧 Kimi `config.json` 中的模型能被读取；浮点秒级 `timestamp` 被转换为毫秒；损坏 JSON 行被静默跳过。对于文件读取失败，先发现文件再删除它，随后调用 `loadUsageRecords(files)`，断言其他文件仍被加载，且 diagnostics 包含已删除文件路径但不包含原始日志正文。
- [ ] **Step 6：运行解析测试确认 RED**

Run: `node --test test/parser.test.js`

Expected: FAIL，因为当前代码会统计 session 累计记录、零 Token 和重复记录，也不会返回 diagnostics。
- [ ] **Step 7：实现最小解析、过滤和去重**

在 `src/parser.js` 中：

```js
function normalizeModel(model, fallback = 'kimi-for-coding') {
  if (typeof model !== 'string' || model.trim() === '') return fallback;
  return model.trim().replace(/^kimi-code\//, '');
}

function recordKey(record) {
  return [
    record.source,
    record.workspace,
    record.sessionId,
    record.agentId ?? '',
    record.time,
    record.model,
    record.messageId ?? '',
    record.inputTokens,
    record.outputTokens,
    record.cacheReadTokens,
    record.cacheCreationTokens,
  ].join('|');
}
```

Kimi Code 分支要求 `data.type === 'usage.record' && data.usageScope === 'turn'`；旧 Kimi 分支继续接受 `StatusUpdate`。数值字段只接受有限且不小于零的数字。时间戳读取 `data.time ?? data.created_at ?? data.timestamp`，小于 `1e12` 的数字按秒转换为毫秒。四类 Token 合计为零时返回 `null`。

`loadUsageRecords` 对旧 Kimi 文件读取 `join(metadata.rootDir, 'config.json')`，使用其中非空的 `model`，否则回退为 `kimi-for-coding`。用 `Set` first-wins 去重；单文件读取失败写入 `{ file, message }` diagnostics 后继续；单行 JSON 损坏仅跳过该行。
- [ ] **Step 8：运行解析测试和完整测试确认 GREEN**

Run: `node --test test/paths.test.js test/parser.test.js && npm test`

Expected: 全部 PASS，无 warning。
- [ ] **Step 9：提交 Task 1**

```bash
git add src/paths.js src/parser.js test/paths.test.js test/parser.test.js
git commit -m "fix: normalize and deduplicate Kimi usage logs"
```

---

### Task 2：实现离线价格解析与配置覆盖

**Files:**
- Create: `src/pricing.js`
- Create: `test/pricing.test.js`
- Modify: `src/config.js`
- Modify: `test/p0.test.js`

**Interfaces:**
- Consumes: Task 1 的 `UsageRecord`
- Produces: `validatePricingConfig(value) -> Record<string, Pricing>`，无效时抛出 `Invalid pricing for <model>: <field>`
- Produces: `priceRecord(record, overrides) -> { totalUsd, inputUsd, outputUsd, cacheReadUsd, cacheCreationUsd, pricingModel } | null`
- `Pricing` 使用每百万 Token 美元价格：`input`, `output`, `cacheRead`, `cacheCreation`
- [ ] **Step 1：写 K2.5/K2.6 切换和精确费用的失败测试**

在 `test/pricing.test.js` 固定切换时间 `2026-04-20T15:28:10.072Z`，断言切换前后候选模型和费用：

```js
assert.equal(resolvePricingModel('kimi-for-coding', cutoff - 1), 'moonshot/kimi-k2.5');
assert.equal(resolvePricingModel('kimi-for-coding', cutoff), 'moonshot/kimi-k2.6');

assert.deepEqual(priceRecord(k26Record, {}), {
  totalUsd: 0.0000062975,
  inputUsd: 0.00000095,
  outputUsd: 0.000004,
  cacheReadUsd: 0.00000016,
  cacheCreationUsd: 0.0000011875,
  pricingModel: 'moonshot/kimi-k2.6',
});
```

测试记录的四类 Token 均为 1。内置每 Token 费率为：K2.5 `0.6e-6 / 3e-6 / 0.1e-6 / 0.75e-6`，K2.6 `0.95e-6 / 4e-6 / 0.16e-6 / 1.1875e-6`。
- [ ] **Step 2：运行 pricing 测试确认 RED**

Run: `node --test test/pricing.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/pricing.js`。
- [ ] **Step 3：实现内置费率、候选模型和费用明细**

在 `src/pricing.js` 中定义：

```js
export const K2_6_CUTOFF_MS = Date.parse('2026-04-20T15:28:10.072Z');

const BUILTIN_PRICING = {
  'moonshot/kimi-k2.5': { input: 0.6, output: 3, cacheRead: 0.1, cacheCreation: 0.75 },
  'moonshot/kimi-k2.6': { input: 0.95, output: 4, cacheRead: 0.16, cacheCreation: 1.1875 },
};
```

表内单位统一为 USD / 1M tokens；计算时除以 `1_000_000`。候选顺序为时间映射、`moonshot/<model>`、`kimi/<model>`、原始模型，配置覆盖优先于内置价格。
- [ ] **Step 4：写未知模型、配置覆盖和无效配置的失败测试**

```js
assert.equal(priceRecord({ ...record, model: 'mcli/glm-5.2' }, {}), null);
assert.equal(
  priceRecord({ ...record, model: 'mcli/glm-5.2' }, {
    'mcli/glm-5.2': { input: 1, output: 2, cacheRead: 0.1, cacheCreation: 1.25 },
  }).totalUsd,
  0.00000435,
);
assert.throws(
  () => validatePricingConfig({ broken: { input: -1 } }),
  /Invalid pricing for broken: input/,
);
```
- [ ] **Step 5：运行测试确认 RED，再实现校验和覆盖**

Run: `node --test test/pricing.test.js`

Expected: FAIL，因为 override 和校验尚未实现。

在 `src/pricing.js` 实现 `validatePricingConfig`：四个字段必须全部是有限且不小于零的数字；返回复制后的安全对象。`src/config.js` 在 `loadConfig` 后校验顶层 `pricing`，并由 `applyConfig` 将其放入 `options.pricing`。
- [ ] **Step 6：运行 pricing、config 和完整测试确认 GREEN**

Run: `node --test test/pricing.test.js test/p0.test.js && npm test`

Expected: 全部 PASS。
- [ ] **Step 7：提交 Task 2**

```bash
git add src/pricing.js src/config.js test/pricing.test.js test/p0.test.js
git commit -m "feat: add offline Kimi cost estimation"
```

---

### Task 3：完善时区过滤、费用聚合和 session 元数据

**Files:**
- Create: `test/summary.test.js`
- Modify: `src/summary.js`

**Interfaces:**
- Consumes: `UsageRecord`，其 `cost` 为 Task 2 的费用对象或 `null`
- Produces: `filterRecords(records, { since, until, timeZone })`
- Produces: daily/weekly/monthly/session rows，包含 `costUsd`, `costComplete`, `missingPricingModels`, `workspaces`, `agentIds`
- [ ] **Step 1：写时区包含边界的失败测试**

在 `test/summary.test.js` 使用两个 UTC 时间分别落在上海时区日期边界内外：

```js
const filtered = filterRecords(records, {
  since: '2026-01-02',
  until: '2026-01-02',
  timeZone: 'Asia/Shanghai',
});
assert.deepEqual(filtered.map((record) => record.id), ['inside-a', 'inside-b']);
```
- [ ] **Step 2：运行测试确认 RED**

Run: `node --test test/summary.test.js`

Expected: FAIL，因为当前过滤固定使用 UTC 边界。
- [ ] **Step 3：用本地日期 key 实现最小过滤**

复用 `dateKey(record.time, timeZone)`，直接比较 `YYYY-MM-DD` 字符串：

```js
export function filterRecords(records, { since, until, timeZone = 'UTC' } = {}) {
  return records.filter((record) => {
    const key = dateKey(record.time, timeZone);
    if (since && key < since) return false;
    if (until && key > until) return false;
    return true;
  });
}
```
- [ ] **Step 4：写混合已知/未知价格与 session 元数据失败测试**

```js
assert.equal(row.costUsd, null);
assert.equal(row.costComplete, false);
assert.deepEqual(row.missingPricingModels, ['mcli/glm-5.2']);
assert.deepEqual(row.workspaces, ['workspace-a']);
assert.deepEqual(row.agentIds, ['main', 'reviewer']);
```

另写全已知价格场景，断言 `costUsd` 为所有 record `totalUsd` 之和且 `costComplete === true`。
- [ ] **Step 5：运行测试确认 RED，再实现最小聚合字段**

Run: `node --test test/summary.test.js`

Expected: FAIL，因为当前 summary 不传播费用完整性和元数据。

在 group 中增加 `costUsd`, `costComplete`, `missingPricingModels`, `workspaces`, `agentIds`。只要存在正 Token 且 `record.cost === null`，该 group 的 `costComplete` 设为 false，最终 `costUsd` 输出 `null`。
- [ ] **Step 6：运行 summary 和完整测试确认 GREEN**

Run: `node --test test/summary.test.js && npm test`

Expected: 全部 PASS。
- [ ] **Step 7：提交 Task 3**

```bash
git add src/summary.js test/summary.test.js
git commit -m "feat: aggregate complete Kimi usage costs"
```

---

### Task 4：接通 CLI、表格、稳定 JSON 与诊断

**Files:**
- Modify: `src/cli.js`
- Modify: `src/render.js`
- Modify: `test/p0.test.js`

**Interfaces:**
- Consumes: `{ records, diagnostics }`、`priceRecord` 和 Task 3 rows
- Produces: `runCli(argv, env) -> Promise<{ stdout, stderr }>`
- Produces: `renderJson(rows, context)`，顶层固定包含 `command`, `timezone`, `costCalculation`, `rows`, `totals`, `missingPricingModels`
- [ ] **Step 1：写 CLI JSON 契约和 unknown pricing 的失败测试**

修改现有测试调用以读取 `{ stdout, stderr }`，并断言：

```js
const result = await runCli(['daily', '--json', '--data-dir', dataDir], { HOME: root });
const report = JSON.parse(result.stdout);
assert.equal(report.command, 'daily');
assert.equal(report.timezone, 'UTC');
assert.equal(report.costCalculation, 'enabled');
assert.equal(report.rows[0].costUsd, null);
assert.deepEqual(report.missingPricingModels, ['mcli/glm-5.2']);
assert.match(result.stderr, /Missing pricing: mcli\/glm-5\.2/);
```

同时添加 `--no-cost` 用例，断言所有 cost 字段为 `null`、`costCalculation === 'disabled'`、没有 missing pricing stderr。
- [ ] **Step 2：运行 CLI 测试确认 RED**

Run: `node --test test/p0.test.js`

Expected: FAIL，因为当前 `runCli` 返回字符串且没有费用阶段和稳定 JSON 元数据。
- [ ] **Step 3：实现 CLI 阶段编排和兼容 bin 输出**

`parseArgs` 增加 `costEnabled: true`；`--no-cost` 将其改为 false。`runCli`：

```js
const loaded = await loadUsageRecords(files);
const priced = loaded.records.map((record) => ({
  ...record,
  cost: options.costEnabled ? priceRecord(record, options.pricing) : null,
}));
const rows = summarize(options.command, filterRecords(priced, options), options);
return {
  stdout: `${options.json ? renderJson(rows, context) : renderTable(rows, label, options)}\n`,
  stderr: renderDiagnostics(loaded.diagnostics, rows, options),
};
```

`bin/kimiusage.js` 改为分别写 `result.stdout` 和 `result.stderr`，异常仍写 stderr 并设置 exit code 1。
- [ ] **Step 4：实现表格 Cost/N/A 和稳定 JSON**

`renderTable` 在费用启用时追加 `Cost`，费用完整时使用美元格式，否则 `N/A`。`renderJson` 不直接 stringify rows，而是构造：

```js
{
  command,
  timezone,
  costCalculation: costEnabled ? 'enabled' : 'disabled',
  rows,
  totals,
  missingPricingModels,
}
```

顶层 missing models 从所有 rows 合并、排序、去重。
- [ ] **Step 5：运行 CLI 测试确认 GREEN**

Run: `node --test test/p0.test.js`

Expected: PASS，JSON.parse 成功，stderr 只包含诊断。
- [ ] **Step 6：运行真实 CLI smoke test**

Run: `node bin/kimiusage.js daily --since 2026-07-01 --json --no-cost > /tmp/kimiusage-report.json && node -e "JSON.parse(require('fs').readFileSync('/tmp/kimiusage-report.json', 'utf8')); console.log('valid json')"`

Expected: stdout 最后一行 `valid json`，CLI 不输出提示词或回复正文。
- [ ] **Step 7：运行完整测试确认 GREEN**

Run: `npm test`

Expected: 全部 PASS，无失败和未处理 warning。
- [ ] **Step 8：提交 Task 4**

```bash
git add bin/kimiusage.js src/cli.js src/render.js test/p0.test.js
git commit -m "feat: expose Kimi costs in CLI reports"
```

---

### Task 5：更新用户文档并完成验收

**Files:**
- Modify: `README.md`
- Verify: all source and test files from Tasks 1-4

**Interfaces:**
- Documents: CLI commands, pricing semantics, config schema, JSON contract, privacy and unknown-price behavior
- [ ] **Step 1：更新 README**

将 `Early MVP` 和“未实现费用”的描述替换为当前能力。增加以下 pricing 示例：

```json
{
  "pricing": {
    "mcli/glm-5.2": {
      "input": 1,
      "output": 2,
      "cacheRead": 0.1,
      "cacheCreation": 1.25
    }
  }
}
```

明确单位是 USD / 1M tokens、费用是估算值、未知价格为 `N/A/null`、`--no-cost` 的语义，以及工具始终离线。
- [ ] **Step 2：检查文档和 CLI 帮助一致性**

Run: `node bin/kimiusage.js --help`

Expected: help 包含真实的 `--no-cost` 说明，不再声称费用未实现；`--offline` 明确为兼容参数且不会联网。
- [ ] **Step 3：运行静态检查和完整测试**

Run: `git diff --check && npm test`

Expected: `git diff --check` 无输出；测试全部 PASS。
- [ ] **Step 4：运行两种数据源 smoke test**

Run: `node bin/kimiusage.js daily --data-dir "$HOME/.kimi-code,$HOME/.kimi" --since 2026-07-01 --no-cost`

Expected: 正常输出表格；没有原始日志内容；无未捕获异常。
- [ ] **Step 5：提交文档**

```bash
git add README.md
git commit -m "docs: document Kimi cost reports"
```
- [ ] **Step 6：准备独立 QA gate brief**

列出用户请求、验收标准、全部变更文件、每条验证命令及结果、已知风险，并要求 QA reviewer 只读返回 `PASS`、`FAIL` 或 `NEEDS WORK`。
- [ ] **Step 7：根据 QA verdict 收口**

若为 `FAIL` 或 `NEEDS WORK`，只修复 reviewer 指出的范围，重新运行对应测试和完整 `npm test`，再发起一次 QA。只有 QA 为 `PASS` 后才宣称完成。
