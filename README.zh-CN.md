# kimiusage

[English](README.md) | [简体中文](README.zh-CN.md)

面向 Kimi Code 会话的本地用量报告工具。

`kimiusage` 读取本地 Kimi/Kimi Code 会话日志，直接在终端中输出 Token
用量汇总。运行过程中不会发起网络请求。

## 功能

- 按日、周、月和会话统计用量
- 汇总输入、输出、缓存读取和缓存创建 Token
- 离线估算 Kimi K2.5 和 K2.6 成本，默认以人民币展示
- 支持为私有、区域或路由模型配置不同币种的价格
- 提供稳定的 JSON 输出和模型明细
- 展示 Kimi Code 工作区和 Agent 元数据
- 兼容旧版 Kimi CLI 日志

## 使用方法

```sh
kimiusage
kimiusage daily
kimiusage weekly
kimiusage monthly
kimiusage session
kimiusage daily --since 2026-01-01 --json
kimiusage weekly --start-of-week monday --compact
kimiusage daily --breakdown
```

默认扫描以下目录：

- `~/.kimi-code`
- `~/.kimi`

可以覆盖默认目录：

```sh
kimiusage daily --data-dir ~/.kimi-code
KIMI_DATA_DIR=~/.kimi-code kimiusage session
```

## 命令

- `daily`：按日汇总，默认命令。
- `weekly`：按周汇总。
- `monthly`：按月汇总。
- `session`：按会话 ID 汇总。

## 选项

- `--since YYYY-MM-DD`：只包含该日期及之后的记录。
- `--until YYYY-MM-DD`：只包含该日期及之前的记录。
- `--timezone IANA`：指定按日、周、月分组时使用的时区。
- `--start-of-week DAY`：指定每周的第一天，默认为 `sunday`。
- `--data-dir PATH[,PATH]`：指定要扫描的数据根目录。
- `--config PATH`：从 JSON 文件加载默认配置。
- `--json`：输出结构化 JSON。
- `--breakdown`：展示每个模型的明细行。
- `--compact`：使用适合窄终端的紧凑表格。
- `--no-cost`：关闭成本估算。
- `--offline`：为兼容其他工具而保留；`kimiusage` 始终离线运行。

## 配置

可以通过 JSON 配置文件保存常用选项：

```json
{
  "defaults": {
    "timezone": "Asia/Shanghai",
    "compact": true,
    "currency": "CNY"
  },
  "commands": {
    "weekly": {
      "startOfWeek": "monday"
    }
  },
  "pricing": {
    "mcli/glm-5.2": {
      "currency": "CNY",
      "input": 1,
      "output": 2,
      "cacheRead": 0.1,
      "cacheCreation": 1.25
    }
  },
  "exchangeRates": {
    "EUR": {
      "perUsd": 0.86,
      "asOf": "2026-07-10",
      "source": "manual"
    }
  }
}
```

四项模型价格均以该条目的 `currency` 为币种，单位为每一百万 Token。
为了向后兼容，未设置 `currency` 的价格会被视为美元价格。
`exchangeRates.<CODE>.perUsd` 表示 1 美元可以兑换多少单位的目标币种；
`defaults.currency` 和模型价格使用的每种币种都必须具有对应汇率。

命令行参数的优先级高于命令配置，命令配置的优先级高于默认配置。
显示币种只能通过配置文件设置。无效的币种代码、日期、汇率或负数价格
都会产生配置错误。

显式加载配置文件：

```sh
kimiusage weekly --config ./kimiusage.json
```

未指定 `--config` 时，`kimiusage` 会依次查找：

- `$KIMIUSAGE_CONFIG`
- `~/.config/kimiusage/config.json`
- `~/.kimiusage.json`

## 数据来源

支持以下输入：

- `~/.kimi-code/sessions/**/agents/*/wire.jsonl` 中的 Kimi Code `usage.record` 事件
- `~/.kimi/sessions/**/wire.jsonl` 中的旧版 Kimi `StatusUpdate.payload.token_usage` 事件

对于 Kimi Code，只统计会话轮次范围内的 `usage.record`。会话级记录是累计值，
会被主动跳过以避免重复计数。格式错误、Token 数为零的记录会被忽略，重复的
用量记录只会统计一次。

## 成本估算

成本计算完全在本地完成，并且始终只是估算值。内置价格快照支持
`kimi-for-coding`，根据记录时间映射到 Moonshot K2.5 或 K2.6。通过 Kimi Code
路由的其他模型会保留实际模型 ID。如果某个模型没有内置或自定义价格，它所在
的行以及受影响的总计会在表格中显示 `N/A`，在 JSON 中显示 `null`；
`kimiusage` 不会把不完整的部分成本当作完整总成本输出。

内部会将所有完整成本统一换算为美元，并保留在 `costUsd` 中。表格和 JSON 中
新增的 `cost` 字段会将该值换算为显示币种。默认显示人民币，使用内置汇率
6.7745407 CNY/USD。该汇率来自 [ECB 参考汇率](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html)，
日期为 2026-07-10。可以在 `exchangeRates` 中覆盖人民币汇率或添加任意三字母
币种；例如，将 `defaults.currency` 设置为 `USD` 可直接显示底层美元估算值。

内置汇率是离线兜底快照，不是实时行情。生成普通报告时不会从网络获取汇率或
模型价格。如果成本准确性很重要，请在配置文件中及时维护汇率和区域或供应商价格。

只需要 Token 数量时可以使用 `--no-cost`。JSON 成本字段会稳定保持为 `null`，
`costCalculation` 为 `"disabled"`，同时不会输出缺少模型价格的诊断信息。

## JSON 输出

JSON 报告包含命令、时区、数据行、总计、成本计算状态、显示币种、汇率和缺少
价格的模型。每个汇总行、模型明细和总计都会保留 `costUsd`，并增加以当前显示
币种表示的 `cost`：

```json
{
  "command": "daily",
  "timezone": "Asia/Shanghai",
  "costCalculation": "enabled",
  "displayCurrency": "CNY",
  "exchangeRate": {
    "perUsd": 6.7745407,
    "asOf": "2026-07-10",
    "source": "ECB reference rates"
  },
  "rows": [],
  "totals": {},
  "missingPricingModels": []
}
```

## 隐私

`kimiusage` 只读取本地会话日志和可选的本地配置文件。它不会输出提示词或消息
内容，不会访问供应商凭据、查询账单 API，也不会发起网络请求。

## 许可证

MIT
