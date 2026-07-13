# Kimi Code 用量报告设计

## 目标

将 `kimiusage` 从早期的 Token 统计 MVP 完善为可靠、离线的 Kimi Code 用量与费用估算工具。实现会借鉴 `ccusage` 已验证的报告模式，但严格控制产品边界：以 Kimi Code 为主要数据源，同时保留对旧版 Kimi CLI 日志的兼容。

## 产品边界

- 主要读取 `~/.kimi-code` 下的 Kimi Code 日志。
- 继续读取 `~/.kimi` 下的旧版 Kimi CLI 日志。
- 统计所有实际通过 Kimi Code 路由的模型，包括 `mcli/glm-5.2` 等非 Kimi 模型。
- 不读取或展示提示词、回复正文。
- 不通过网络发送用量数据。
- 不增加 Claude Code、Codex、OpenCode 或其他 Agent 的适配器。
- 不查询任何厂商的账户余额或计费 API。

## 方案对比

### 最小 MVP 修补

修正 turn 级记录解析并加入小型价格表，不改变当前处理管线。这个方案 diff 最小，但路径校验仍然较弱，也缺少去重机制、明确的未知价格处理和稳定的 JSON 契约。

### 聚焦版 ccusage 管线

保留现有的零依赖 Node.js 实现，把处理管线拆分为日志发现、数据规范化、去重、定价、聚合和渲染。这样能满足正确性要求，又不会引入 ccusage 的多 Agent 架构。

选择此方案。

### 基于 ccusage 的 Rust 重写

从 ccusage 抽取 Kimi 适配器和报告能力，重写为 Rust CLI。这样可以最大化直接复用，但会替换当前项目、增加打包复杂度，并带来超出当前仓库需要的维护成本。

## 数据处理管线

```text
数据根目录
  -> 受约束的 wire 文件发现
  -> 逐行解析和数据规范化
  -> 过滤零 Token、无效记录和 session 累计记录
  -> 稳定去重
  -> 模型规范化和价格解析
  -> 按时间、会话、模型聚合
  -> 表格或 JSON 渲染
```

各阶段均接收和返回普通数据对象。定价与渲染不直接读取文件，解析逻辑也不依赖 CLI 参数。

## 日志发现

默认根目录仍为 `~/.kimi-code` 和 `~/.kimi`，可由 `KIMI_DATA_DIR` 或 `--data-dir` 覆盖。

只接受以下目录结构：

```text
~/.kimi-code/sessions/<workspace>/<session>/agents/<agent>/wire.jsonl
~/.kimi/sessions/<group>/<session>/wire.jsonl
```

忽略嵌套在其他位置的无关 `wire.jsonl`。根目录和文件路径都会排序、去重，以保证输出稳定。

## 解析与规范化

### Kimi Code

- 接受类型为 `usage.record` 的记录。
- 只接受 `usageScope: "turn"`；session 级记录是累计数据，不能再叠加进 turn 总量。
- 读取 `inputOther`、`output`、`inputCacheRead` 和 `inputCacheCreation`。
- 使用记录中的时间戳，并从路径中保留 workspace、session 和 agent 标识。
- 移除 `kimi-code/kimi-for-coding` 等模型 ID 的传输前缀，同时保留其他路由模型 ID。

### 旧版 Kimi CLI

- 接受包含 `payload.token_usage` 的 `StatusUpdate` 消息。
- 读取 snake_case Token 字段，并在存在时读取 message ID。
- 从 Kimi 根目录的 `config.json` 读取配置模型；读取不到时明确回退到 `kimi-for-coding`，不再使用 `unknown`。

### 公共行为

- 跳过损坏的 JSON、缺少时间戳的记录和零 Token 记录。
- 将无效或负数 Token 规范化为零。
- 分别保留缓存读取和缓存创建 Token。
- 使用稳定的来源标识去重：session、agent、时间戳、模型、可用时的 message ID，以及 Token 指纹。
- 单个文件损坏或不可读时不终止整份报告。CLI 记录诊断信息后继续；诊断信息不写入 stdout，保证 JSON 输出有效。

## 定价

费用均为本地估算值。新增独立的 pricing 模块，返回结构化费用明细或 `null`。

- `kimi-for-coding` 在已知的 K2.6 切换时间之前映射到 Moonshot K2.5，在该时间及之后映射到 Moonshot K2.6。
- 候选匹配会考虑规范化模型 ID 和已知的厂商前缀别名。
- 配置文件可以为路由模型或私有模型提供显式的每百万 Token 价格。
- 缓存创建和缓存读取拥有各自独立的可配置价格。
- 缺少价格时返回 `null`，绝不返回零。
- 如果一个聚合结果同时包含有价格和无价格的有效用量，其费用返回 `null`，不展示可能误导用户的不完整金额。
- 报告返回去重后的 `missingPricingModels`，明确指出费用合计不完整的原因。
- `--no-cost` 关闭价格解析，并隐藏费用列和价格缺失警告。
- `--offline` 为兼容性继续接受；所有行为本来就是离线的，文档会明确说明。

首个实现只内置经过确认的 Kimi 价格别名。对于 `mcli/glm-5.2` 等模型，不会静默猜测价格；用户可以通过配置补充。

## 聚合

保留现有命令：

- `daily`
- `weekly`
- `monthly`
- `session`

每个聚合结果包含各类 Token、Token 总数、估算费用或 `null`、会话数量、模型列表和可选的模型明细。session 行还会在存在时保留 workspace 和 agent 元数据。

`--since` 和 `--until` 的日期边界按照配置的 IANA 时区解释。周聚合继续遵守 `--start-of-week`。

## 输出契约

### 表格

- 保留现有易读、零依赖的表格实现。
- 启用费用计算时增加 `Cost` 列。
- 未知或不完整费用显示为 `N/A`，不显示 `$0.00`。
- 保留 compact 模式和模型明细行。
- 报告输出后，将简洁的价格缺失诊断写入 stderr。

### JSON

返回稳定的顶层对象：

```json
{
  "command": "daily",
  "timezone": "Asia/Shanghai",
  "rows": [],
  "totals": {},
  "missingPricingModels": []
}
```

Token 值保持数字类型，费用值为数字或 `null`。诊断信息不会污染 stdout。使用 `--no-cost` 时，JSON 中稳定保留费用字段并设为 `null`，返回 `costCalculation: "disabled"`，同时将 `missingPricingModels` 保持为空数组。

## 配置

继续使用现有优先级：CLI 参数高于命令配置，命令配置高于默认配置。新增以模型别名为 key 的 `pricing` 对象。每项可配置输入、输出、缓存读取和缓存创建的每百万 Token 美元价格。

无效价格配置会产生清晰的配置错误，不会被忽略或当成零处理。

## 验证

测试覆盖：

- 受约束的新版与旧版日志发现；
- 包含 turn 记录并排除 session 累计记录；
- 损坏、缺少时间戳、负数和零 Token 记录；
- 模型名称规范化和非 Kimi 路由模型；
- 稳定去重；
- 旧版模型回退与配置读取；
- 按时间切换 K2.5/K2.6 价格；
- 自定义价格覆盖和价格缺失；
- daily、weekly、monthly 和 session 聚合；
- 根据时区执行包含边界的日期过滤；
- compact、breakdown、cost、no-cost 和 JSON 渲染；
- CLI 诊断信息不污染 stdout。

现有测试必须保持通过。新增行为先写聚焦测试，再修改实现。

## 交付范围

实现会修改现有 CLI、配置、解析器、路径发现、聚合、渲染、README 和测试，并新增 pricing 模块。不进行无关重构，不增加第三方依赖、网络访问、厂商鉴权或其他 Agent 的适配器。
