---
name: "log-decision"
description: "Mechanical role that writes a decision in two layers — conclusion to the decisions store, reasoning to configured durable memory. Returns a write-receipt. Use when a significant decision has been made and must be durably recorded — both the conclusion (for quick lookup) and the reasoning (for future recall)."
---


# Log decision

When run in an isolated child context, act as the mechanical, two-layer write role. A calling skill invokes this role
when a significant decision has been settled and must be recorded. Perform two writes — per the
**`decisions-schema`** contract (the entry shape, the
supersede-in-place rule, the single-writer guarantee) — and return a receipt. You do not
synthesise, assess, or converse.

**The decision to invoke you rests with the caller.** `design`, `shape`, `debrief`, and
`architecture-review` decide what is significant enough to log; you record any settled decision
presented to you **without assessing its significance**. You are not an admission gate — over- or
under-logging is the caller's concern, not yours.

## Two-layer write — the contract

| layer | destination | always? | content |
|---|---|---|---|
| Conclusion | `docs/decisions.md` | **yes — unconditional** | The settled decision, stated tightly: what was decided, why (the rationale), what was rejected, its consequences (when given), and status. |
| Reasoning | configured durable-memory service | **yes — with graceful fallback** | The surrounding context: the transcript moment, the options considered, the evidence, the open questions parked. |

**Fallback:** if the durable-memory service is unavailable in this harness, append the reasoning as a
structured block immediately below the conclusion in `docs/decisions.md`, clearly marked
`<!-- reasoning: durable memory unavailable -->`. Never silently skip the reasoning layer — the write-
receipt must always report the actual disposition of each layer.

## Read your invocation bundle

```yaml
decision_id: <string>                  # e.g. "D12" or a slug; caller assigns
conclusion: <string>                   # the settled decision, in full
rationale: <string>                    # why this and not the alternatives
rejected_alternatives: [<string>, ...] # what was considered and set aside
consequences: [<string>, ...] | null   # optional; what the decision commits us to downstream — positive, negative, and neutral effects (ADR "Consequences"). Emitted in both layers.
status: accepted | provisional | supersedes:<prior-id>
evidence_refs: [<path-or-url>, ...]    # optional; files / URLs that ground the decision
open_questions: [<string>, ...] | null # parked questions; goes to reasoning only
reasoning_context: <string> | null     # surrounding transcript / discussion context
source_node: shape | debrief | architecture-review
sprint_id: <string>
decisions_store_path: <path>           # path to docs/decisions.md in the current workspace
```

## Procedure

### 1. Format the conclusion

Construct the conclusion entry in the `docs/decisions.md` format:

```
**<decision_id> — <conclusion, first sentence as heading>** <remainder of conclusion>.
Why: <rationale>. Rejected: <alternatives, comma-separated, or omitted if none>.
Consequences: <consequences, comma-separated — omitted entirely if null>. Status: <status>.
```

Format the conclusion so a reader with no access to gbrain can understand and act on it: do not
reference "see gbrain for context" — the conclusion stands alone.

### 2. Append to docs/decisions.md

Open `decisions_store_path`. Append the formatted conclusion at the end of the appropriate
section (match `source_node` to section — design decisions, shape decisions, debrief/outcome
decisions, architecture-review decisions — or append to a general section if the file has no
matching section). Do **not** reorder existing entries.

**If `status: supersedes:<prior-id>`**, also back-annotate the prior entry: find the
`<prior-id>` entry and append a targeted `Superseded by: <decision_id>` note **in place** to it
(keep its position and its original position-text intact). This is the store's documented
supersede-in-place convention (`decisions-schema` §"Supersede in place") — an in-place annotation,
not a reorder or a rewrite. If `<prior-id>` is not found, record a warning in the receipt and
proceed (do not invent the prior entry).

### 2b. Re-derive the decisions-index

After every store write (an append or a supersede back-annotation), **re-derive the harness's
`decisions-index`** — the on-demand lookup at the path the **`decisions-index-path`** binding
resolves (the same file `harness-init` step 4d generates — one bound path, two writers): regenerate its table as the same pure
function of the store `harness-init` used (one row per settled entry — id + a terse gist + its
locator), leaving the file's frontmatter intact. The store's sole writer refreshing the store's
one projection is what keeps the index drift-free by construction. If the index is absent (a
pre-init harness), **skip** and record one warning in the receipt — never create the slot here
(`harness-init` owns crystallisation).

### 3. Write reasoning to durable memory

Use the configured durable-memory write capability with:

```yaml
source: <workspace durable-memory source id>
key: <decision_id>
content: |
  Sprint: <sprint_id>
  Source: <source_node>
  Decision: <decision_id>
  
  Context: <reasoning_context>
  Consequences: <consequences, newline-separated, or "none">
  Evidence: <evidence_refs, newline-separated>
  Open questions: <open_questions, newline-separated, or "none">
tags: [decision, <source_node>, <sprint_id>]
```

If the write fails or durable memory is unavailable: apply the fallback (append reasoning block in
`docs/decisions.md` below the conclusion, marked `<!-- reasoning: durable memory unavailable -->`).
Record the failure in the write-receipt.

### 4. Return the write-receipt

```yaml
decision_id: <string>
conclusion_written: true | false
conclusion_path: <path>
reasoning_written: true | false
reasoning_destination: gbrain | decisions_store_fallback
gbrain_key: <string> | null
superseded_prior: <prior-id> | null   # the entry back-annotated, when status was supersedes:<prior-id>
warnings: [<string>, ...]         # e.g. "gbrain unavailable — fallback applied"; "supersedes:<id> — prior entry not found"
```

## Hard limits

- Do not reorder existing entries in `docs/decisions.md`. The **only** permitted edit to a prior
  entry is the `Superseded by: <id>` back-annotation (step 2) — never a rewrite of its content.
- Do not skip the reasoning layer without recording the skip in the write-receipt.
- Do not assess whether the decision is correct, or whether it was significant enough to log — you
  record; the calling node decides both.
- Do not converse with the operator. Return the receipt and stop.

## Required references

Before taking any action, read these bundled references:

- [decisions-schema](references/decisions-schema.md)

