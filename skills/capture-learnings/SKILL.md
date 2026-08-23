---
name: "capture-learnings"
description: "Generative curation role that surfaces a sprint's durable learnings, deduplicates them against what is recorded, and routes each to its tiered knowledge home as a proposal; writes nothing. Use when debrief needs the sprint's learnings curated for the operator to enact."
---


# Capture learnings

When run in an isolated child context, act as the generative curation role. At `learn`, surface the durable
learnings from a completed sprint — the errors and omissions it caught — and route each to its
knowledge home as a **proposal**, so a learning becomes a **permanent guardrail** rather than
something re-discovered next sprint: *every error and every omission, once caught, becomes a
permanent check*. You run **recall-then-dedup** (query what is already known *before* deriving
anew), classify each learning by its **tiered home**, and return a structured proposals list.
You **write nothing and converse with no one** — the writes are `debrief`'s, enacted on the
operator's confirmation.

**Surfaced, not enforced.** You propose and route; the committed `learnings-archive` and the
`recurring_unacted` flag **detect** re-derivation across sprints; **no enactment is obligated**
— there is no enactment SLA, no owner-and-deadline. The flywheel spins by detection.

**The isolated role is intentional.** Curation must not load every raw learning into the main
thread and accumulate it in the operator's window. You curate;
the orchestrator enacts.

## Read your invocation bundle

```yaml
sprint_id: <string>
sprint_summary: <string>              # 3-5 sentences: what the sprint did + key moments
transcript_path: <path> | null        # local transcript for this sprint, if available
decisions_made: [<string>, ...]       # decisions logged this sprint (from log-decision)
metrics_report: <object> | null       # measure-outcomes' output for this sprint, if available
prior_verdict: <object> | null        # the prior sprint's outcome verdict (trend context)
recall_results: <object> | null       # debrief's recall-preflight output
decisions_store_path: <path>          # the durable decisions store
learnings_archive_path: <path> | null # the committed prior-proposals archive — READ-ONLY here
                                      # (debrief writes it); a fresh harness passes the empty
                                      # file (non-null); null only when the binding is unset
```

## Procedure

### 1. Gather raw material

Read `sprint_summary`, `decisions_made`, and (if available) the `metrics_report` and
`prior_verdict`. If `transcript_path` is non-null, read it — but do not dump it back; synthesise
only.

Check the knowledge substrate before deriving anything new:

- **Recall (durable memory):** start from `recall_results`; query the configured durable-memory
  capability for the sprint's key topics to find prior learnings. If that capability is unavailable, fall back to
  the full degraded set — `decisions_store_path`, the prior-proposals archive
  (`learnings_archive_path`), and a grep of the transcript — and note in the emitted summary
  that the duplicate-rate metric is **degraded** without recall (the fallback set is narrower
  than a semantic query).
- **The durable doctrine homes:** check whether a candidate finding is already stated in the
  decisions store, a zone brief, or a reference in the graph before proposing it.

### 2. Surface candidates

From the raw material, identify findings that meet the durability test:

> **Durable** = the finding applies beyond this sprint; a future operator or node would benefit
> from knowing it; it is not specific to the one deliverable or its exact context.

Candidate classes, by **tiered home**:

| class | home | the proposal's route (enacted by debrief / the operator) |
|---|---|---|
| An error or omission a permanent check would catch | **test** | a raise through the front; lands in the product's suite like any unit |
| Causal insight about a node's behaviour / failure mode; decision rationale exceeding the logged conclusion | **recall** | `debrief` → recall write, inline |
| A pattern that should update a node's contract, goals, or earns-keep | **node-amend** | an operator-reviewed node amendment |
| Per-surface coding doctrine for *this* product (local) | **zone-brief** | `context-curator` `raise → integrate`, placed by `context-principles` |
| General methodology (vendored doctrine) | **reference** | the **upstream factory seam** — a proposal via `harness-update` / the factory's graph-maintainer; never a local-curator raise (the local curator enacts its own local surfaces only) |

### 3. Dedup — graduated overlap, not binary

For each candidate, **score its overlap** against what is already recorded and act on the level —
never a binary keep/drop:

| overlap | meaning | action |
|---|---|---|
| **verbatim** | already stated, same substance | skip; flag `duplicate_recall` or `duplicate_recorded` by where it was found |
| **same domain, different angle** | the topic exists but this adds a new facet, condition, or counter-example | propose as a **refinement** (`refinement_of:<prior-id>`), not a fresh learning |
| **genuinely new** | no prior record covers it | propose as new |

Score against three sources:

1. **Recall (gbrain):** is this already in recall? (Capability-gated — if absent, this arm of the
   score is degraded; see step 1.)
2. **The durable homes:** is this already stated in the decisions store, a zone brief, or a
   reference in the graph?
3. **Prior proposals:** read the prior-proposals archive at `learnings_archive_path` — the
   committed surface `debrief` writes after each gate. If a finding **recurs there without
   enactment**, flag `recurring_unacted` and carry its recurrence count. **Enactment wins:** a
   prior-archive entry now present in a durable home or recall (checks 1–2) was *enacted between
   sprints* — classify the match `duplicate_recorded`/`duplicate_recall`, **not**
   `recurring_unacted`; the flag fires only when the prior proposal is still absent from every
   home. If the archive is **empty** (a freshly-scaffolded harness) or **unset** (no binding),
   treat the prior set as empty and emit **no** `recurring_unacted` flags — degrade cleanly.

**Supersession check:** also test whether a *new* finding **invalidates** a prior learning
(makes it wrong, not merely refines it). List those prior ids in `supersedes_candidates` on the
proposal — a flag for the orchestrator to act on, never a write.

### 4. Classify and propose

For each candidate that passes dedup:

- Assign a `home` from the tiered table above.
- Assign a `priority`: `high` (blocks future work if not enacted), `medium` (improves a pattern
  over time), `low` (nice-to-have).
- Summarise the learning in one sentence — clear, imperative, general (not sprint-specific).
- State the evidence that makes it durable (the sprint moment that surfaced it, the metric that
  confirmed it, the prior finding it extends).

**Visibility escalates with recurrence — obligation never does.** Order the list
`recurring_unacted` first (highest recurrence count at the top), then by priority: a proposal
that keeps surviving unenacted gets a **louder surface** each sprint, so the operator sees the
recurrence plainly — but it is a signal, never an SLA.

### 5. Emit the proposals list

```yaml
sprint_id: <string>
captured_at: <ISO-8601 timestamp>
proposals:
  - id: <slug — e.g. "learning-2026-07-01-01">
    home: test | recall | node-amend | zone-brief | reference
    priority: high | medium | low
    learning: <one sentence — imperative, general>
    evidence: <one sentence — the sprint moment or metric that grounds it>
    dedup_status: new | refinement_of:<prior-id> | recurring_unacted
    recurring_count: <int> | null                    # sprints this has survived unenacted
    supersedes_candidates: [<prior-id>, ...] | null  # prior learnings this finding invalidates
    route: <the home's enactment route, from the class table>
skipped:
  - candidate: <short description>
    reason: duplicate_recall | duplicate_recorded | not_durable | insufficient_evidence
summary:
  total_candidates: <N>
  proposed: <N>
  skipped: <N>
  recurring_unacted: <N>
  recall_degraded: <bool>              # true when the dedup ran without recall
```

After the operator filters this list, the **surviving-but-unenacted** proposals are persisted to
the committed `learnings-archive` **by `debrief`** — that is the archive step 3 reads next sprint
to detect `recurring_unacted`. You do not write it; you only read the prior one.

## Hard limits

- Do not write to any file. The proposals list is your return value only.
- Do not invent a learning from the sprint summary alone — every proposal must have evidence (a
  transcript moment, a metrics delta, a decision that surfaced a pattern).
- Do not propose a finding already stated verbatim in a durable home or recall without flagging
  it as a duplicate.
- Do not route general (vendored-doctrine) findings to a local surface — they cross the factory
  seam upstream as proposals; the local curator enacts local surfaces only.
- Do not attach enactment obligations — no owner, no deadline, no SLA; recurrence escalates
  visibility only.
