---
kind: reference
id: instrumentation-preamble
title: Instrumentation preamble — node enter/exit emit contract
description: "The deterministic enter/exit emit contract every backbone node depends on. On entry, record a node-enter event; on exit, a node-exit event carrying the outcome and any gates touched. Carrier-tagged when a carrier is in context. Events append as JSONL to the .stack-graph/ event log in the workspace. Single-sourced into every consumer at build via @-import (load: import)."
status: v0.1.0 — 2026-06-01
---

# Instrumentation preamble

This is the shared emit contract every node imports. It governs how a node records its
lifecycle to the event log. The contract is deterministic — it is not a judgment call.

## On entry

At the start of your run, emit a `node-enter` event. Append it as a single JSON line to
`.stack-graph/events.jsonl` in the workspace (create the file and the `.stack-graph/`
directory if absent).

```json
{ "ts": "<ISO-8601 timestamp>", "session": "<session-id>", "kind": "enter",
  "node": "<your-node-id>", "carrier": "<carrier-id-or-null>" }
```

- `ts` — the current UTC timestamp in ISO-8601 format (`YYYY-MM-DDTHH:MM:SSZ`).
- `session` — the active session identifier (use the value available from the harness
  environment; fall back to a generated short id if absent).
- `kind` — literal `"enter"`.
- `node` — your node's `id` frontmatter value.
- `carrier` — the carrier id if a carrier is in context (the work item this traversal
  serves); `null` if no carrier is active. Do not invent a carrier id; if there is no
  carrier binding in scope, emit `null`.

Emit this event before reading the carrier or performing any phase work.

## On exit

At the end of your run — after all phases complete, before you return control — emit a
`node-exit` event:

```json
{ "ts": "<ISO-8601 timestamp>", "session": "<session-id>", "kind": "exit",
  "node": "<your-node-id>", "carrier": "<carrier-id-or-null>",
  "outcome": "<outcome-string>", "gates": ["<gate-name>:<pass|fail>", ...] }
```

- `ts`, `session`, `node`, `carrier` — same as the enter event.
- `kind` — literal `"exit"`.
- `outcome` — a short string describing the result of this node's run. Use one of the
  canonical outcome labels the node's goals name (e.g. `"intent-settled"`,
  `"design-doc-produced"`, `"plan-approved"`, `"change-landed"`) or `"aborted"` if the
  run did not complete. Choose the label that best matches the actual result; do not
  invent new labels beyond what the node's goals define.
- `gates` — an array of gate records for every explicit gate this run touched. Each entry
  is `"<gate-name>:<pass|fail>"` — e.g. `"commit-to-build:pass"` or
  `"live-confirmed:fail"`. Emit an empty array `[]` if no gates were explicitly checked.

Emit this event after all phase work is done and any final operator output has been
delivered. Never emit a node-exit before the work is complete.

## Appending to the event log

Events are JSONL — one JSON object per line, newline-terminated. The log path is always
`.stack-graph/events.jsonl` relative to the workspace root.

- If the file does not exist, create it (and the `.stack-graph/` directory if needed).
- Append — never overwrite the log. Each run of a node adds two lines: one enter, one exit.
- The log is ephemeral: it is gitignored in the factory and in consuming workspaces.
  Its content is the event substrate; the permanent record is the frozen traversal
  snapshot in the closed carrier file (see `06-analytics`).

## Carrier tagging

When a carrier is in context, every event is tagged with the carrier id. This makes the
carrier's stage-position a derived projection from the event log — the analytics layer
reads the latest stage event for a given carrier id to compute `current_stage`. Do not
write `current_stage` to the carrier file; let the projection compute it from these events.

If no carrier is in context (a standalone invocation, a factory-loop traversal, or any
run that does not serve a specific work item), emit `"carrier": null`. The event is still
valid and is counted in factory conformance metrics; it simply does not contribute to any
carrier's stage projection.

## Method note

This contract is method-agnostic: it does not prescribe how you append to the file
(a tool call, a script, an inline write). Use whatever append method is available in
your execution context. The contract governs the content and the timing, not the
mechanism.
