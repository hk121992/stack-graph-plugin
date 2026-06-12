# analyzer test fixtures

Tiny **synthetic** Claude Code transcript tree the analyzer test (`analyze.test.ts`) derives over.
Hand-authored (not lifted from a real workspace), so it carries **no private content** and pins the
exact transcript shapes the analyzer parses (verified against real logs under
`~/.claude/projects/**` while authoring Cluster A). Field shapes confirmed real:

- denial / rejection / tool-error arrive as a `tool_result` block on a **`type:"user"`** entry, with
  `is_error:true` and a string `content` (`"… has been denied."` / `"The user doesn't want to
  proceed…"` / a `<tool_use_error>…`).
- `Skill` tool_use input is `{skill, args}` (not `{name}`); a slash invocation is a
  `<command-name>/x</command-name>` block in a user message.
- `attributionSkill` is on assistant entries and toggles per-message (coalesced in §3.4).
- a subagent dispatch prompt is the **first user message** of `<session>/subagents/agent-*.jsonl`; the
  `META: carrier=… kind=… arc=… iu=…` line is what loop-runner emits after A3′ (absent on today's real
  prose bundles, so attribution falls back).

## Layout

```
projects/
  sess-alpha.jsonl                         top-level session: /triage slash + Skill(triage) span,
                                           usage (TTL split + flat-fallback), a hard denial, a user
                                           rejection, a tool error, a permissionDecision=deny.
  sess-alpha/subagents/agent-build1.jsonl  dispatched build IU with a META: line → attribution
                                           (carrier=wave-A kind=standalone-iu arc=incremental iu=A1)
                                           + dispatch/unit usage.
  sess-looprunner/subagents/agent-lr1.jsonl  a full loop-runner field-form dispatch prompt (the A3′
                                           producer form: GOAL/WHERE/DO/DONE-WHEN/POL/META) → the META
                                           line resolves carrier=loop-batch-3 kind=standalone-iu
                                           arc=incremental iu=B7 even though it is not the first line.
  sess-browse.jsonl                        ~30 attributionSkill browse↔null toggles → must coalesce
                                           to ONE span (browse is non-graph → no node row, §3.4).
  sess-verdict.jsonl                       a /review span whose FINAL assistant message carries a
                                           <sg-signal>{"gates":["experience-contract:pass"]}</sg-signal>
                                           block → the §7 parser attaches the gate to review's
                                           enter/exit rows (layer-2 model-authored verdict channel).
  sess-prose/subagents/agent-prose1.jsonl  dispatched session with a PROSE first message (no META:)
                                           → attribution falls back to null (never a wrong carrier).
  sess-gate-before.jsonl                   Skill(review) span at 2026-06-12T18:00:30Z (gate-holding).
  sess-gate-after.jsonl                    Skill(land) span at 2026-06-13T08:00:00Z → a ~14h
                                           cross-session gap → one stall-record tagged before_node=review.
```

## Pinned token sums (computed via `lib/transcript-usage.ts`)

- `sess-alpha.jsonl` → input 300, output 130, cc5m 60, cc1h 5, read 10, **total 505** (2 counted, model claude-opus-4-8).
- `agent-build1.jsonl` → input 450, output 180, cc5m 10, cc1h 0, read 50, **total 690** (2 counted, model claude-opus-4-8).
