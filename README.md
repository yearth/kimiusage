# kimiusage

Local usage reports for Kimi Code sessions.

`kimiusage` reads local Kimi/Kimi Code session logs and prints token usage
summaries directly in your terminal. It does not make network requests.

## Status

Early MVP. It currently reports token counts only; cost estimation is
intentionally not implemented yet.

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
- `--no-cost` / `--offline` - accepted for compatibility; cost estimation is not implemented yet.

## Configuration

You can keep repeated options in a JSON config file:

```json
{
  "defaults": {
    "timezone": "Asia/Shanghai",
    "compact": true
  },
  "commands": {
    "weekly": {
      "startOfWeek": "monday"
    }
  }
}
```

Load it explicitly:

```sh
kimiusage weekly --config ./kimiusage.json
```

Without `--config`, `kimiusage` looks for:

- `$KIMIUSAGE_CONFIG`
- `~/.config/kimiusage/config.json`
- `~/.kimiusage.json`

## Data Sources

The MVP supports:

- Kimi Code `usage.record` events in `~/.kimi-code/sessions/**/agents/*/wire.jsonl`
- Legacy Kimi `StatusUpdate.payload.token_usage` events in `~/.kimi/sessions/**/wire.jsonl`

## Privacy

`kimiusage` only reads local session log files. It does not print prompt or
message content; it only aggregates usage fields.

## License

MIT
