# kimiusage 多币种显示与 CLI/配置测试补强设计

## 背景

当前 kimiusage 以 USD/百万 Token 保存模型价格，聚合结果使用 `costUsd`，表格固定显示 `$`。这保证了费用计算的一致性，但对默认使用人民币的用户不够自然，也无法直接表达“某个渠道在中国区本来就按 CNY 定价”的情况。

现有覆盖率报告同时显示：整体源码行覆盖率已经达到 93.88%，但 `src/cli.js` 为 72.12%，`src/config.js` 为 87.32%。主要缺口位于公开输入边界，包括 help、无效参数、缺值、命令路由、配置自动发现、配置优先级和非法配置，而不是核心聚合算法。

## 目标

1. 默认以 CNY 显示估算费用，同时保留 USD 作为内部统一基准。
2. 将模型原始价格与显示货币转换拆成独立层。
3. 允许自定义模型价格声明其原始币种，支持地区或渠道的实际价格。
4. 允许用户在配置文件中新增或覆盖汇率。
5. 普通报告命令继续完全离线，不在运行时隐式查询价格或汇率。
6. 补齐 CLI、配置和渲染的高价值测试边界，不机械追求 100% 覆盖率。

## 非目标

- 本次不实现实时汇率 API。
- 本次不实现运行时模型价格抓取。
- 本次不新增自动地区识别、IP 定位或税费计算。
- 本次不维护同一模型的多个内置地区 profile；当日志本身无法区分地区时，由用户价格覆盖表达实际渠道价格。
- 本次不新增 `kimiusage update-pricing`，也不新增自动更新 GitHub Action；这些作为后续独立功能评估。

## 方案选择

### 方案 A：所有模型价格继续使用 USD，只转换显示金额

实现最简单，但中国区原生 CNY 价格必须先由用户手工折算成 USD，无法准确表达区域价格的来源币种，因此不采用。

### 方案 B：每次运行动态查询模型价格与汇率

数据较新，但会破坏 kimiusage 当前的纯离线承诺，使同一历史报告随执行日期变化，并引入超时、限流、缓存和上游可用性问题，因此不采用。

### 方案 C：原始价格币种 + 内置汇率快照 + 配置覆盖

模型价格声明原始币种，费用统一归一化为 USD，再转换成显示币种。内置快照保证开箱即用，用户配置拥有最高优先级，普通命令不联网。该方案兼顾区域价格、离线使用、结果可审计和未来扩展，作为本次采用方案。

## 价格与货币分层

数据流固定为：

```text
Token 用量
  → 按模型原始价格币种计算
  → 使用汇率归一化为 costUsd
  → 聚合与费用完整性判断
  → 转换成 displayCurrency 用于表格和 JSON 展示
```

`costUsd` 继续是聚合层的规范金额，避免混合多个原始币种时无法相加。显示层不能反向影响 Token 计数、价格匹配或费用完整性。

## 货币模块

新增 `src/currency.js`，职责仅包括：

- 合并内置汇率和用户汇率；
- 校验 ISO 4217 风格的三位货币代码和正数汇率；
- 在任意已配置币种与 USD 之间转换；
- 按显示币种格式化金额；
- 暴露当前汇率的 `perUsd`、`asOf` 和 `source` 元数据。

所有汇率统一定义为“1 USD 对应多少目标币种”，字段名为 `perUsd`。USD 固定为 `perUsd: 1`，不得配置为其他数值。

默认显示币种为 `CNY`。内置 CNY 兜底汇率使用欧洲央行 2026-07-10 参考汇率交叉计算：EUR/USD 为 1.1430、EUR/CNY 为 7.7433，因此 `CNY per USD = 7.7433 / 1.1430 = 6.7745407`。内置元数据记录来源 URL `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml` 和日期 `2026-07-10`。

货币代码输入大小写不敏感，内部统一转为大写。未知货币、非正数或非有限汇率、非法日期和被错误覆盖的 USD 汇率均产生明确配置错误。

## 配置契约

配置示例：

```json
{
  "defaults": {
    "currency": "CNY"
  },
  "exchangeRates": {
    "CNY": {
      "perUsd": 6.8,
      "asOf": "2026-07-13",
      "source": "personal override"
    },
    "EUR": {
      "perUsd": 0.86,
      "asOf": "2026-07-13"
    }
  },
  "pricing": {
    "mcli/glm-5.2": {
      "currency": "CNY",
      "input": 4,
      "output": 16,
      "cacheRead": 1,
      "cacheCreation": 4
    }
  }
}
```

`defaults.currency` 控制显示币种。`exchangeRates` 为顶层共享配置，不允许命令级覆盖。自定义 pricing 的 `currency` 可省略，省略时保持向后兼容并按 `USD` 处理。四个 Token 价格字段仍表示“原始币种/百万 Token”。

用户汇率覆盖同名内置汇率。若显示币种或模型价格币种没有可用汇率，配置加载直接失败，不生成可能误导的金额。

现有配置优先级继续成立：显式 CLI 参数高于命令配置，命令配置高于 defaults。由于本次不新增 `--currency`，显示币种来自 `defaults.currency`，未配置时使用内置默认 `CNY`。

## 定价与聚合

内置 K2.5/K2.6 价格明确标记为 `USD`。`priceRecord` 先按价格条目的原始币种计算四类费用，再通过货币模块转换为现有的 USD 费用字段。返回对象继续保留：

- `totalUsd`
- `inputUsd`
- `outputUsd`
- `cacheReadUsd`
- `cacheCreationUsd`
- `pricingModel`

并新增 `pricingCurrency` 以便诊断。

`extraTokens > 0`、缺失模型价格或缺失必要汇率时，仍不得输出部分费用。聚合层继续只累计完整的 `costUsd`，不改变现有 `costComplete` 和 `missingPricingModels` 语义。

## 表格与 JSON 输出

表格费用列标题从 `Cost` 改为 `Cost (CNY)`、`Cost (USD)` 等明确形式。默认 CNY 使用人民币货币符号，保留当前针对小额费用的动态小数位，不能把有效小额费用舍入成 `¥0.00`。

JSON 保留所有现有 `costUsd` 字段以兼容脚本，并新增：

```json
{
  "displayCurrency": "CNY",
  "exchangeRate": {
    "perUsd": 6.7745407,
    "asOf": "2026-07-10",
    "source": "ECB reference rates"
  }
}
```

每个 row、model breakdown 和 totals 新增 `cost`，表示按 `displayCurrency` 转换后的数值；费用不完整或关闭费用计算时仍为 `null`。JSON 中的数值不附带货币符号。

`--no-cost` 继续隐藏表格费用列，并让 `costUsd`、`cost` 保持 `null`。缺失价格仍显示 `N/A`，整体费用仍不得展示不完整的部分合计。

## CLI 与配置测试补强

新增独立的 CLI 和配置测试文件，避免继续扩大 `test/p0.test.js`。覆盖以下公开边界：

- `--help` 和 usage 文本；
- daily、weekly、monthly、session 命令路由与表格标签；
- `--since`、`--until`、`--timezone`、`--compact`、`--breakdown` 和 `--offline` 解析；
- 未知命令、未知参数和参数缺值错误；
- `$KIMIUSAGE_CONFIG`、XDG 风格 HOME 路径和 `~/.kimiusage.json` 自动发现顺序；
- 非对象顶层配置错误；
- defaults、command 和显式 CLI 参数优先级；
- `timezone`/`timeZone`、`dataDirs`/`dataDir` 兼容输入；
- 内置 CNY、用户汇率覆盖、额外货币、非法汇率和原始价格币种；
- CNY/USD 表格格式、breakdown 分支以及 JSON 双金额契约。

验收目标是 `src/cli.js` 行覆盖率不低于 90%，`src/config.js` 行覆盖率不低于 95%，两者分支覆盖率不低于 80%。目标用于确保公开边界得到验证，不要求全项目达到 100%。

## 错误处理

配置错误沿用 CLI 顶层错误处理，写入 stderr 并返回非零退出码。错误信息必须包含具体货币或字段，例如：

- `Invalid currency code: CN`
- `Invalid exchange rate for CNY: perUsd`
- `USD exchange rate must be 1`
- `Missing exchange rate for EUR`
- `Invalid pricing for mcli/glm-5.2: currency`

读取日志失败和模型价格缺失的现有诊断行为保持不变。

## 文档与兼容性

README 更新默认 CNY、汇率快照、配置 schema、原始价格币种、USD 规范金额以及完全离线行为。已有 pricing 配置没有 `currency` 时继续按 USD 解释，因此不要求用户迁移。

现有 JSON 字段不删除、不改名；新增字段属于向后兼容扩展。表格的费用列标题和符号会按新默认发生有意变化。

## 验证

实现采用 TDD，先观察新增边界测试失败，再进行最小实现。完成后执行：

```sh
npm test
node --test --experimental-test-coverage
git diff --check
npm pack --dry-run
```

最后使用真实 `~/.kimi-code,~/.kimi` 数据验证默认 CNY、显式 USD 配置、JSON 可解析、`--no-cost` 和缺失价格场景，并按全局规则交给独立 QA subagent 只读验收。
