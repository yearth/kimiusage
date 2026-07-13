# kimiusage

[English](README.md) | [简体中文](README.zh-CN.md)

Local usage reports for Kimi Code sessions.

`kimiusage` reads local Kimi/Kimi Code session logs and prints token usage
summaries directly in your terminal. It does not make network requests.

## Features

- Daily, weekly, monthly, and per-session reports
- Input, output, cache-read, and cache-creation token totals
- Offline estimated cost for Kimi K2.5 and K2.6, displayed in CNY by default
- Currency-aware pricing overrides for private, regional, or routed models
- Stable JSON output and per-model breakdowns
- Kimi Code workspace/agent metadata
- Legacy Kimi CLI log compatibility

## Usage

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

By default it scans:

- `~/.kimi-code`
- `~/.kimi`

You can override this with:

```sh
kimiusage daily --data-dir ~/.kimi-code
KIMI_DATA_DIR=~/.kimi-code kimiusage session
```

## Commands

- `daily` - group usage by day. This is the default.
- `weekly` - group usage by week.
- `monthly` - group usage by month.
- `session` - group usage by session id.

## Options

- `--since YYYY-MM-DD` - include records on or after this date.
- `--until YYYY-MM-DD` - include records on or before this date.
- `--timezone IANA` - timezone for day, week, and month grouping.
- `--start-of-week DAY` - week start for weekly reports; defaults to `sunday`.
- `--data-dir PATH[,PATH]` - data roots to scan.
- `--config PATH` - load defaults from a JSON config file.
- `--json` - print structured JSON.
- `--breakdown` - show per-model breakdown rows.
- `--compact` - use a compact table layout for narrow terminals.
- `--no-cost` - disable estimated cost calculation.
- `--offline` - accepted for compatibility; `kimiusage` is always offline.

## Configuration

You can keep repeated options in a JSON config file:

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

The four pricing values are expressed in the entry's `currency`, per one
million tokens. Existing entries without `currency` remain USD prices for
backward compatibility. `exchangeRates.<CODE>.perUsd` means units of that
currency per 1 USD; every currency used by `defaults.currency` or a pricing
entry must have a rate.

CLI flags override command configuration, which overrides defaults. Currency
is intentionally config-only. Invalid currency codes, dates, exchange rates,
or negative pricing values produce a configuration error.

Load it explicitly:

```sh
kimiusage weekly --config ./kimiusage.json
```

Without `--config`, `kimiusage` looks for:

- `$KIMIUSAGE_CONFIG`
- `~/.config/kimiusage/config.json`
- `~/.kimiusage.json`

## Data Sources

Supported inputs:

- Kimi Code `usage.record` events in `~/.kimi-code/sessions/**/agents/*/wire.jsonl`
- Legacy Kimi `StatusUpdate.payload.token_usage` events in `~/.kimi/sessions/**/wire.jsonl`

For Kimi Code, only turn-scoped `usage.record` entries are counted. Session
records are cumulative totals and are intentionally skipped to prevent double
counting. Malformed and zero-token records are ignored, and duplicate usage
records are counted once.

## Cost Estimation

Cost calculation is local and is always an estimate. The built-in pricing
snapshot covers `kimi-for-coding`, mapped by timestamp to Moonshot K2.5 or
K2.6. Models routed through Kimi Code retain their actual model IDs. If a
model has no built-in or configured price, its row and any affected total show
`N/A` in tables and `null` in JSON; `kimiusage` never reports an incomplete
partial sum as if it were the full cost.

Internally, all complete costs are normalized to USD and retained as `costUsd`.
Tables and the additional JSON `cost` fields convert that value to the display
currency. The default is CNY, using a built-in rate of 6.7745407 CNY per USD
from the [ECB reference rates](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html),
dated 2026-07-10. You can override CNY or add any three-letter currency in
`exchangeRates`; for example, set `defaults.currency` to `USD` to display the
underlying USD estimate directly.

The built-in rate is an offline fallback snapshot, not a live quote. Normal
reports never fetch exchange rates or pricing from the network. Keep rates and
regional/provider prices current in your config when accuracy matters.

Use `--no-cost` when you only need token counts. It keeps JSON cost fields
stable as `null`, reports `costCalculation: "disabled"`, and suppresses missing
pricing diagnostics.

## JSON Output

JSON reports contain the command, timezone, rows, totals, cost-calculation
state, display currency, exchange rate, and missing pricing models. Each row,
model breakdown, and total retains `costUsd` and adds `cost` in the selected
display currency:

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

## Privacy

`kimiusage` only reads local session log files and optional local configuration.
It does not print prompt or message content, access provider credentials, query
billing APIs, or make network requests.

## License

MIT
