---
name: "record-gate"
description: "The single mechanical writer of a carrier's lifecycle_state + append-only gate_decisions[] — checks the operator-attestation precondition, then appends a hash-chain-linked entry and advances the state. No widget, no judgment — the gate experience lives in the firing skill's session. Use when a firing gate node (triage or shape at the front gates, verify at commit-to-land, land at live-confirmed, debrief's closeout exit, auto-shaper's provisional hold, dispatch's ancestry-reconcile) must record a lifecycle transition rather than write the carrier fields directly."
---


# Record gate

You are **the single mechanical writer** of a carrier's `lifecycle_state` and its append-only
`gate_decisions[]` log — a deterministic script: no widget, no judgment, no conversation. The gate
*experience* — the widget presentation, the review conversation, the attestation collection — lives
in the **firing skill's session**: `triage` at intent-to-build, `shape` (or `auto-shaper` on the
FAST path, where the warm main session fires) at commit-to-build, `verify` at commit-to-land, `land` at live-confirmed, `debrief` at
closeout. Its presentation rules — carrier-generated, widget-first, the real click — are `gate-model`
§Sign-off surface's. The firing node invokes you at the point a lifecycle transition must be recorded.
**The caller decides; you enact the record.** Decision-authority — the operator's go/no-go — is
distinct from recording-mechanism. A gate-firing node never writes `lifecycle_state` or
`gate_decisions` directly; it invokes you, and you are the only writer of those two fields.

You write **no other carrier field**. `current_stage` and the transition history are projection-owned
(derived from the event log, never written by any node); content is the front's role. You own only the
gate-recorded half. The field shapes — the `gate_decisions[]` entry, the `decision_provenance` rule,
and the full hash-chain definition — are specified in the required `gate-model`; read `IU-schema` and
`work-item-schema` for the carriers that carry those fields. Do not restate those tables here — enact
them.

## Inputs

The caller supplies: the carrier (`carrier_id` + kind + arc), the **gate id** (one of the five below,
or an ancestry-reconcile write), the **decision**
(`cleared | declined | reconciled | promote | confirmed | closed | promoted | …` — `promoted` is
closeout's persistent-outcome disposition, not `promote`, commit-to-land's), the
**`decision_provenance`** (`operator-attested | agent-auto | agent-provisional`) and whether the
invoking context is attended or unattended (dispatcher-run), plus `owner`, `evidence_refs`,
`confidence`, and any `conditions` / `override`. Read the current chain head (`seq`, `hash`) from the
carrier file.

## Invocation

You are a skill that owns a deterministic runner, not a conversational gate procedure. After a
firing skill invokes you, resolve `record-gate.ts` relative to this `SKILL.md`, then **run the
bundled script** from this skill directory. Never hand-execute the precondition check or chain
append in the firing session:

```
bun ./record-gate.ts \
  --carrier <path> --gate <gate-id> --decision <decision> \
  --decision-provenance <operator-attested|agent-auto|agent-provisional> \
  --owner <owner> --context <attended|unattended> \
  --kind <standalone-iu|work-item> \
  [--evidence <ref> …] [--confidence <level>] [--conditions <text>] [--override <text>] \
  [--timestamp <iso8601>]
```

You read the carrier's frontmatter (the chain head via the vendored YAML parser), check the five
preconditions in code, compute the next link with the pinned `canonical.ts`, and write the appended
`gate_decisions[]` entry plus the advanced `lifecycle_state` — surgically, touching only those two
regions of the frontmatter and no other line or the body. On a refused write you exit non-zero,
surface the reason, and leave the carrier byte-for-byte unchanged; on an enacted write you exit zero
and print the record. `--kind` is **required for `intent-to-build`** and takes one of two values —
`standalone-iu` selects the no-advance genesis (`seq 0`, `lifecycle_state` untouched), `work-item`
advances `idea → discovery`; omitting it, or passing anything else, is refused as `malformed:
intent-to-build requires --kind standalone-iu | work-item`. The other four gates ignore `--kind`.
The single-writer boundary is thereby held by an actual separate writer — this runner plus the
pinned `canonical.ts` and the `generate:check` guard — not by the firing session writing on itself.

## The five gates

Every gate id is a **product gate** (⇒ operator-attested, below). Each writes at its own grain:

- **`intent-to-build`** — fired from `triage` at the front (or from `shape`, on an idea-shaped continuation). Two-faced by carrier kind: a grouping
  **work-item** advances `idea → discovery`; a standalone **IU** records a **no-advance genesis**
  entry (`seq 0`) — no state change.
- **`commit-to-build`** — fired from `shape` (FULL) or by the **warm main session** on `auto-shaper`'s
  return (FAST) in the warm
  session. FULL records **once on the WI grouping** (`→ committed`; its units inherit the gate by
  reference); FAST records on the standalone IU's **own** chain.
- **`commit-to-land`** — fired from `verify` at its exit. Records **per-IU** `in-delivery → shipped`,
  `decision: promote` — one operator sign-off may clear a whole promotion set, but the record is
  per-IU on each promoted carrier. The retro-ratification entries (below) land here too. `land`
  records the enactment evidence once the promotion's merge is real — a follow-up evidence append on the carrier's chain, never an edit of the promote entry.
- **`live-confirmed`** — fired from `land` at its exit. Records **per-IU** `shipped → live`,
  `decision: confirmed`. Prod-facing only — a single-main carrier (no prod deploy target) skips it
  and terminates at `shipped`.
- **`closeout`** — the terminal write, via `debrief`'s exit. Records `shipped|live → closed`
  (`decision: closed | promoted`; `shipped → closed` is the single-main path). See the cascade below.

## Precondition — check before any write

Classify the gate and the context, then **reject** a non-compliant write (leave `lifecycle_state` and
the log unchanged, surface the reason to the caller) or proceed. These rules are safety-critical — do
not skip or compress them:

1. **A product gate can ONLY be recorded operator-attested.** `decision_provenance: agent-auto` is
   **structurally prohibited on a product gate id** — reject it. A product-gate decision the operator
   did not attest must never reach the log.
2. **An unattended context has exactly two legal writes.** When invoked inside a dispatcher-run
   (unattended) session, reject everything except the `agent-provisional` hold (rule 3) and the
   **ancestry-reconcile record** (`decision: reconciled` — the after-the-fact record of an
   out-of-band merge; it asserts no approval, only reconciles the ledger with git reality). You do
   not put a decision to an absent operator.
3. **The one carve-out: the `agent-provisional` hold.** An unattended `agent-provisional` entry may
   be written for a qualifying gap's `commit-to-build` — a gap that is in-scope ∧ outcome-necessary ∧
   decision-completable, formalised on the unattended DEV-zone path (`verify` dispatches
   `auto-shaper` cold; both are legitimate callers on their own paths). It is a **hold, not an
   approval** — it grants no authority and is **inert until ratified**: the write also sets the
   carrier's **`pending_retro_ratification`** flag, and the operator attestation relocates to
   `commit-to-land`, where an operator-attested **retro-ratification** entry clears the flag (or the
   gap is dropped and backed out — the hold is never final). Reject an `agent-provisional` write
   outside this carve-out — any other gate id, or a non-qualifying path.
4. **The ratification guard.** Reject a `commit-to-land` `promote` while any carrier in the promotion
   set still carries an unresolved `pending_retro_ratification`.
5. **Reject a malformed precondition** — a missing/invalid `decision`, `decision_provenance`, or chain
   head.

You put no decision to anyone. Hand-run or dispatched, the go/no-go you record was collected in the
firing skill's session — the widget, the review conversation, the real-click attestation are the
firing node's duties, never yours; you deterministically check the precondition and enact the record.
The unattended branch does not violate that — it *restricts* (records only the reconcile record and the
carve-out hold, refuses product-gate `agent-auto`) rather than proceeding on a decision it would
otherwise put to an operator.

## Enact the record

Once the precondition holds:

1. **Compute the chain link.** Append is a hash-**chain** link, not a standalone per-entry hash:
   `hash_n = H(canonical(content_n) ‖ seq_n ‖ hash_{n-1})`, with the next `seq` (contiguous from 0) and
   the prior entry's `hash`. Compute `canonical(...)` with the **same pinned serialization** the
   single-writer guard imports — `./deps/canonical.ts`.
   Writer and guard MUST use that one function so the stated chain and the checked chain cannot drift;
   never re-implement the serialization here.
2. **Append, growth-only.** Add the new entry; never edit or reorder a prior entry. Contiguous `seq`
   from 0, length only increases. This chain discipline is what makes the four tamper classes —
   closing edit, reorder, truncation, replay — all detectable (the full argument is in
   `gate-model`; do not restate it).
3. **Advance `lifecycle_state`** to the gate's target state — except the no-advance genesis
   (intent-to-build on a standalone IU), which appends the entry and leaves the state untouched.

## The reconciled path

When invoked to reconcile an **already-true** out-of-band merge (`dispatch`'s ancestry-reconcile
write), append a `commit-to-land` entry with `decision: reconciled` **naming the out-of-band merge**.
You are still the **single** commit-to-land writer of the terminal transition — you record an
already-true merge rather than enacting a fresh one. This is not a second writer.

## The closeout cascade

`closeout` disposes at the unit of the deliverable, and `closed` **cascades**: one `closed` append
**per affected carrier** — the WI carrier **and** every child IU — each on its **own** hash-chain.
The WI's entry chains off its own head; each child IU's off its terminal landing entry —
`live-confirmed` when prod-facing, the `commit-to-land`/`shipped` entry when single-main — so the
predecessor is always satisfiable. A standalone IU closes on its own chain alone. Closeout is a
disposition (*stop monitoring*), not an achievement certificate — you record it like any other
product gate.

## The `<sg-gate>` enactment tag — the analytics channel

On a **successful enactment only**, after writing the carrier you append **one** bounded `<sg-gate>` tag
to **stdout** — the provenance-bound signal the analyzer's gate scanner captures into a gate-enactment
row, so gate throughput is measurable **without model cooperation**:

```
<sg-gate>{"gate":"<gate-id>","decision":"<decision>","carrier":"<carrier-id>","seq":<n>}</sg-gate>
```

- Strict **single-line JSON**; four bounded fields — `gate` (a validated product-gate id), `decision`,
  `carrier` (the id **normalised from the `--carrier` PATH operand** — basename minus `.md`, ID_RE-clean;
  never the raw path), and the chain `seq` (integer). Registered in `sg-tag-registry` as the one
  `emitter-class: script` member.
- A **rejection prints no tag** — the append reaches only past every precondition, so a refused write is
  tagless. The tag and the enactment are one boundary: a `<sg-gate>` tag exists iff a chain entry was
  written.
- The scanner accepts the tag **only with executed-runner provenance** — it must be paired with the
  result of a shell command that **ran this bundled script** (executed-argv-anchored, not a substring).
  A prose echo, a mention-only command, a file-read of this reference or the runner source, or a replay
  through an unrelated command result is **refused** (counted, never derived). You emit the honest tag; the
  reader enforces its provenance.

## Output

Either:
- **A rejection** — the write is refused (product-gate `agent-auto`; an unattended write outside the two carve-outs; an
  `agent-provisional` write outside the carve-out; a `promote` blocked by the ratification guard; a
  malformed precondition); `lifecycle_state` and the log are unchanged; the reason is surfaced to the
  caller; **no `<sg-gate>` tag is printed**.
- **An enacted record** — a new `gate_decisions[]` entry with the next `seq`, its computed chain
  `hash`, and its `decision_provenance`, with `lifecycle_state` advanced (or the no-advance genesis
  appended), **plus the `<sg-gate>` tag on stdout** (above). An `agent-provisional` write also sets `pending_retro_ratification`; the matching
  retro-ratification at `commit-to-land` is an operator-attested entry that clears it. Growth-only; no
  prior entry touched; no other carrier field written; no second store emitted.

You are the **mechanism**; the **single-writer guard** (the build gate) is the **enforcement** — it
rejects any non-record-gate edit of the two fields, any product-gate `agent-auto` / unattended entry,
and any out-of-carve-out `agent-provisional` (the conventions side is the SEC-1 guard in
`product-dashboard-conventions`). Together the writer and the guard make the write-boundary hold
structurally, not by convention.

## Required references

Before taking any action, read these bundled references:

- [gate-model](references/gate-model.md)

## On-demand references

At the step of need, read these bundled references:

- [IU-schema](references/IU-schema.md)
- [product-dashboard-conventions](references/product-dashboard-conventions.md)
- [work-item-schema](references/work-item-schema.md)

