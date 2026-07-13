# Kimi Code Usage Reporting Design

## Goal

Evolve `kimiusage` from an early token-counting MVP into a reliable, offline
usage and estimated-cost reporting tool for Kimi Code. The implementation will
borrow proven reporting patterns from `ccusage` while keeping a deliberately
narrow product boundary: Kimi Code is the primary data source, with legacy Kimi
CLI logs retained for compatibility.

## Product Boundary

- Read Kimi Code logs under `~/.kimi-code` as the primary source.
- Continue reading legacy Kimi CLI logs under `~/.kimi`.
- Include every model actually routed through Kimi Code, including non-Kimi
  models such as `mcli/glm-5.2`.
- Never read or render prompt or response content.
- Never send usage data over the network.
- Do not add adapters for Claude Code, Codex, OpenCode, or other agents.
- Do not attempt to query provider account balances or billing APIs.

## Approaches Considered

### Minimal MVP patch

Fix turn-scoped parsing and add a small price table without changing the
pipeline. This has the smallest diff, but leaves weak path validation, no
deduplication, ambiguous unknown-price handling, and an unstable JSON contract.

### Focused ccusage-style pipeline

Keep the existing dependency-free Node.js implementation and separate the
pipeline into discovery, normalization, deduplication, pricing, aggregation,
and rendering. This provides the required correctness without importing
ccusage's multi-agent architecture.

This is the selected approach.

### Rust rewrite based on ccusage

Extract the Kimi adapter and reporting machinery into a new Rust CLI. This
would maximize direct reuse but would replace the current project, complicate
packaging, and introduce more maintenance than the repository currently needs.

## Data Pipeline

```text
data roots
  -> constrained wire-file discovery
  -> line parsing and normalization
  -> zero/invalid/session-scope filtering
  -> stable deduplication
  -> model normalization and price resolution
  -> time/session/model aggregation
  -> table or JSON rendering
```

Each stage will accept and return plain data objects. Pricing and rendering
will not read files directly, and parsing will not depend on CLI flags.

## Discovery

Default roots remain `~/.kimi-code` and `~/.kimi`, overridden by
`KIMI_DATA_DIR` or `--data-dir`.

Only these layouts are accepted:

```text
~/.kimi-code/sessions/<workspace>/<session>/agents/<agent>/wire.jsonl
~/.kimi/sessions/<group>/<session>/wire.jsonl
```

Unrelated `wire.jsonl` files nested elsewhere are ignored. Root and file paths
are sorted and deduplicated to keep output deterministic.

## Parsing and Normalization

### Kimi Code

- Accept records whose type is `usage.record`.
- Accept only `usageScope: "turn"`; session-scoped records are cumulative and
  must not be added to turn totals.
- Read `inputOther`, `output`, `inputCacheRead`, and `inputCacheCreation`.
- Use the record timestamp and preserve workspace, session, and agent identity
  from the path.
- Remove the transport prefix from model IDs such as
  `kimi-code/kimi-for-coding`, while retaining other routed model IDs.

### Legacy Kimi CLI

- Accept `StatusUpdate` messages containing `payload.token_usage`.
- Read the snake-case token fields and message ID when present.
- Read the configured model from the Kimi root `config.json`; otherwise use
  `kimi-for-coding` as the explicit fallback rather than `unknown`.

### Shared behavior

- Skip malformed JSON, missing timestamps, and zero-token records.
- Normalize invalid or negative token counts to zero.
- Preserve cache-read and cache-creation tokens separately.
- Deduplicate using stable source identity: session, agent, timestamp, model,
  message ID when available, and the token fingerprint.
- A malformed or unreadable file does not abort all reports. The CLI records a
  diagnostic and continues; diagnostics remain off stdout so JSON stays valid.

## Pricing

Pricing is estimated and local. A new pricing module will return either a
structured cost breakdown or `null`.

- `kimi-for-coding` resolves to Moonshot K2.5 before the known K2.6 transition
  timestamp and Moonshot K2.6 at or after it.
- Candidate lookup considers the normalized model ID and known provider-prefixed
  aliases.
- Configuration can provide explicit per-million-token prices for routed or
  private models.
- Cache creation and cache read have their own configurable rates.
- Missing pricing returns `null`, never zero.
- If an aggregate mixes priced and unpriced positive usage, its cost is `null`
  rather than a misleading partial sum.
- Reports expose unique `missingPricingModels` so incomplete totals are visible.
- `--no-cost` disables price resolution and omits cost columns and warnings.
- `--offline` remains accepted for compatibility; all behavior is already
  offline and it will be documented as such.

The first implementation will include only verified Kimi pricing aliases. It
will not silently guess prices for models such as `mcli/glm-5.2`; users can add
those through configuration.

## Aggregation

The existing commands remain:

- `daily`
- `weekly`
- `monthly`
- `session`

Every aggregate contains token categories, total tokens, estimated cost or
`null`, session count, model list, and optional model breakdowns. Session rows
also retain workspace and agent metadata when available.

Date boundaries for `--since` and `--until` are interpreted in the configured
IANA timezone. Weekly grouping continues to honor `--start-of-week`.

## Output Contracts

### Table

- Keep the current readable, dependency-free table.
- Add a `Cost` column when cost calculation is enabled.
- Render unknown or incomplete cost as `N/A`, not `$0.00`.
- Preserve compact mode and model breakdown rows.
- Print concise missing-price diagnostics to stderr after the report.

### JSON

Return a stable top-level object containing:

```json
{
  "command": "daily",
  "timezone": "Asia/Shanghai",
  "rows": [],
  "totals": {},
  "missingPricingModels": []
}
```

Token values remain numbers. Cost values are numbers or `null`. Diagnostics do
not contaminate stdout. When `--no-cost` is active, JSON keeps the stable cost
fields as `null`, reports `costCalculation: "disabled"`, and leaves
`missingPricingModels` empty.

## Configuration

Existing configuration precedence remains CLI over command config over default
config. Add a `pricing` object keyed by model alias. Each entry may provide
input, output, cache-read, and cache-creation USD-per-million rates.

Invalid price entries fail with a clear configuration error rather than being
ignored or treated as zero.

## Validation

Tests will cover:

- constrained discovery of modern and legacy layouts;
- turn-scope inclusion and session-scope exclusion;
- malformed, missing-time, negative, and zero-token records;
- model normalization and routed non-Kimi models;
- stable deduplication;
- legacy model fallback and config lookup;
- K2.5/K2.6 timestamp-based price resolution;
- custom price overrides and missing pricing;
- daily, weekly, monthly, and session aggregation;
- timezone-aware inclusive date filtering;
- compact, breakdown, cost, no-cost, and JSON rendering;
- CLI diagnostics without stdout corruption.

The existing test suite must remain green. New behavior will be developed with
focused tests before implementation changes.

## Delivery Scope

The implementation will modify the existing CLI, configuration, parser, path,
summary, rendering, README, and tests, and add a pricing module. It will avoid
unrelated refactors, third-party dependencies, network access, provider auth,
and other-agent adapters.
