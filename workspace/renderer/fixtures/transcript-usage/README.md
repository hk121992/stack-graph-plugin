# `transcript-usage` fixture

`sample-transcript.jsonl` is a **sanitized** Claude Code transcript used by
`workspace/renderer/transcript-usage.test.ts` to pin `lib/transcript-usage.ts`.

## Provenance

Each line's `message.id`, `message.model`, and `message.usage` (including the
`cache_creation.{ephemeral_5m_input_tokens,ephemeral_1h_input_tokens}` TTL split) are **real**
values captured from live transcripts under
`~/.claude/projects/-home-gstack-projects-stack-graph/*.jsonl`. Everything else is sanitized:

- `message.content` text/thinking replaced with short `[sanitized …]` placeholders.
- `cwd`, `gitBranch`, `userType`, `version`, file paths, and the real `parentUuid` chain blanked
  or replaced with synthetic `u-*` uuids.

## What it exercises (synthetic-where-noted)

- **Dedup, max-total tie-break** — `msg_01EbfgAhH7BMmDzyzhkrUTCP` appears twice; the second
  occurrence has a higher `output_tokens` (600 vs 546) and must win.
- **TTL split read** — most lines carry the `cache_creation` split (incl `ephemeral_1h`).
- **Flat-fallback + warning (synthetic)** — `msg_01XUJbjCqW154pXMy6zZaJsT` has its
  `cache_creation` object removed so only the flat `cache_creation_input_tokens` remains; the summer
  must attribute it to the 5m bucket and emit a warning.
- **By-model subtotals** — three real models: `claude-opus-4-6`, `claude-opus-4-8`,
  `claude-fable-5`.
- **Skip no-usage (synthetic)** — `msg_synthetic_no_usage` is an assistant entry with no
  `message.usage` (interrupt/compaction-shaped); must be skipped + counted.
- **Skip truncated final line (synthetic)** — the last line is deliberately truncated mid-JSON
  (the normal tail of a live transcript); must be skipped, never throw.
- A leading `type:"user"` line confirms non-assistant entries are ignored (not counted as skipped).
