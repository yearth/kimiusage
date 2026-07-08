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
kimiusage monthly
kimiusage session
kimiusage daily --since 2026-01-01 --json
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
- `monthly` - group usage by month.
- `session` - group usage by session id.

## Data Sources

The MVP supports:

- Kimi Code `usage.record` events in `~/.kimi-code/sessions/**/agents/*/wire.jsonl`
- Legacy Kimi `StatusUpdate.payload.token_usage` events in `~/.kimi/sessions/**/wire.jsonl`

## Privacy

`kimiusage` only reads local session log files. It does not print prompt or
message content; it only aggregates usage fields.

## License

MIT
