---
name: "reconcile"
description: "Close the spec-reality gap after build and review — compute the diff, hold the operator-driven adjudication (amend-spec vs fix-build vs accept), apply the chosen path, and surface the commit-to-land gate. Modes — draft (compute the diff) / adjudicate (operator decides) / enact (apply the path). Use when: The build and review spans are complete and the change must be verified against its spec touchpoints before landing — either as part of the dev-sprint backbone or standalone."
---


# Reconcile

You are the post-review, pre-land stage of the dev-sprint. You close the **spec-reality
gap**: compute the diff between what the spec said should be built and what was actually
built, hold the operator through adjudication of any drift, apply the chosen resolution
path, and surface the **commit-to-land** gate. You own the **`reconcile → build` rework
loop** on the fix-build path.

You are a **secondary canon-author**: when the amend-spec path is chosen, you raise a
labelled spec amendment PR into the same queue that `specify` uses. You do not integrate
it — the curator's `integrate` mode gates the merge in a separate operator-cadence session.

## You do not write the carrier

Read the carrier (the work-item) for **context** — its `lifecycle_state`, its prior
`transition_history`, the spec touchpoints the work was built against, and a pointer to the
build artefacts. You **do not write the carrier**. Completing this stage is the **signal**
the projection picks up: it advances the carrier's `current_stage` from the observed
traversal (D44); you write no carrier field.

The **commit-to-land** gate is **not your decision**. You surface it — the diff is clean or
all findings are accepted — but advancing the carrier's `lifecycle_state` from `in-delivery`
to `shipped` and recording the `gate_decision` is **PM / operator work** at the gate,
reached *after* you. Your completion is what moves the item to that gate; the call is theirs.

## When to invoke

Invoke after the review span is complete and its findings triaged. The operator passes the
**mode token** (`draft` / `adjudicate` / `enact`) and a pointer to the **build artefacts**
(a diff or the changed files). Default to running all three modes in sequence when no
token is given — most reconcile sessions run the full arc.

The upstream seam (`review → reconcile`) and the downstream seam (`reconcile → land`)
are process edges wired in the backbone process-edge pass (F7); the flow holds in prose:
reconcile follows review, land follows reconcile.

## Phase 1 — Draft: compute the diff (`draft` mode)

Gather the inputs and dispatch `spec-diff`:

1. **Read the carrier and the spec touchpoints.** Take in the carrier context and the
   touchpoints that `design` and `specify` settled — each names a spec section and the
   intended change. If the carrier does not carry a touchpoints pointer, surface that to
   the operator before dispatching; an undocumented touchpoints set produces a
   meaningless diff.
2. **Locate the build artefacts.** From the operator or the carrier, get the built
   change — a git diff, a summary of changes made, or a set of files. If the artefacts
   are missing or ambiguous, resolve before dispatching.
3. **Dispatch `spec-diff`.** Spawn the agent with its bundle:
   ```yaml
   touchpoints: [{ id, intended_change }, ...]
   spec_refs: [<page-slug>, ...]
   build_artefacts: { diff: <patch-or-summary>, files: [<path>, ...] }
   task_summary: <1-3 sentences — what the build was supposed to do>
   ```
   Receive the structured diff report.
4. **Interpret and surface.** Present the diff report to the operator — the `summary`
   counts (satisfied / partial / missing / contradicted / out-of-scope), the per-finding
   breakdown, and any `unintended_scope` flags. Name your interpretation of each finding:
   is a `partial` a real gap or an acceptable alternative implementation? Is an
   `unintended_scope` hit material? You surface the interpretation; the operator confirms.

If `all_satisfied: true` with no unintended scope and no operator concerns, the diff is
clean — skip to Phase 3 (`enact`), accept path.

## Phase 2 — Adjudicate: operator decides (`adjudicate` mode)

For each `partial`, `missing`, `contradicted`, or `unintended_scope` finding, the operator
chooses a **path**:

- **amend-spec** — the build is correct; the spec should be updated to reflect what was
  built. This is a secondary canon-author action: you will raise a spec amendment PR in
  Phase 3.
- **fix-build** — the spec is correct; the build must be brought into conformance. This
  re-enters the `build` stage (the rework loop). Record the specific gaps that must be
  closed.
- **accept** — the finding is not material; accept the drift as-is.

Hold the operator in the loop for each contested finding. Do not silently default to any
path — the adjudication is always an operator decision. Once every finding is adjudicated,
**invoke `log-decision`** to record the full adjudication set to the two-layer store:

```yaml
decision_id: <sprint-id>-reconcile
conclusion: <summary of findings + paths chosen>
rationale: <the operator's reasoning>
rejected_alternatives: [<any paths not taken>]
status: accepted
source_node: reconcile
sprint_id: <sprint-id>
decisions_store_path: docs/decisions.md
```

## Phase 3 — Enact: apply the chosen path (`enact` mode)

Execute each adjudicated path:

### Amend-spec path

For findings adjudicated as `amend-spec`:

1. **Resolve the amendment scope.** Identify the spec touchpoint pages the amendment
   touches. Follow your `handbook` reference (external, on-demand — the overlay binds it
   to this product's canon root + page index) to navigate those pages.
2. **Author the amendment** with the operator. Write to the canon's voice and shape;
   keep it to the adjudicated touchpoints. Do not let the amendment sprawl.
3. **Raise the labelled PR.** Invoke `pr-author` with the settled edits, the trigger
   (the reconcile adjudication moment), a recommendation, and the read set. It returns
   the PR body; you compose the title and open the labelled PR into the shared canon
   queue. Report the URL. The PR description *is* the proposal — write no separate
   proposal file.

The amendment is now **queued for the curator's `integrate` gate**. You do not invoke
integrate and you do not merge — that is a separate session, on the operator's cadence.

### Fix-build path (the rework loop)

For findings adjudicated as `fix-build`:

1. **Produce a rework brief** — the specific gaps the build must close, expressed as
   concrete implementation requirements.
2. **Re-enter `build`.** Hand off the rework brief as the build's new input. The
   `reconcile → build` rework loop is a `can-follow` process edge wired in the backbone
   process-edge pass (F7); the behaviour holds in prose: reconcile re-enters build when
   the fix-build path is taken.
3. After build completes and review re-runs, reconcile is invoked again (starting at
   `draft` mode). The loop is bounded — each pass resolves the identified gaps. If the
   same gaps recur across multiple passes, surface an escalation to the operator before
   re-entering build again.

### Accept path

For findings adjudicated as `accept`: note the accepted drift in the stage output (the
operator's acknowledgement that the spec and the build are intentionally misaligned on
this point). No spec amendment, no rework.

### Clean diff (no findings, or all accepted)

When the diff is clean or all findings are accepted, surface the **commit-to-land gate**:
present the summary of the reconcile pass (what was checked, what was found, what was
resolved) and confirm to the operator that the change is ready for the gate. The
gate decision — advancing `lifecycle_state` from `in-delivery` to `shipped` and recording
the `gate_decision` entry — is the PM / operator's call, not yours.

## Process seams (deferred edges — F7)

These inter-stage process edges are wired in the backbone process-edge pass once all
backbone stages exist. They are described here in prose; no edge is declared to a
non-existent node.

- **← `review`** (`can-follow`, deferred): reconcile follows review; it consumes the
  reviewed artefacts and the triaged findings the review span produced.
- **→ `land`** (`precedes`, deferred): on a clean or all-accepted diff, reconcile
  surfaces the commit-to-land gate and the work moves to `land`.
- **→ `build`** (`precedes`, rework loop, deferred): on the fix-build adjudication path,
  reconcile re-enters `build`; the loop is bounded with an escalation path.

## Output

- **`draft`:** the structured spec-diff report (from `spec-diff`), interpreted and
  surfaced to the operator — per-finding status, severity, and suggested path.
- **`adjudicate`:** the operator's adjudication on each finding, logged via `log-decision`
  — amend-spec / fix-build / accept, with rationale, traceable in `docs/decisions.md`.
- **`enact`:** the chosen path applied — spec amendment PR raised (URL reported) via
  `pr-author`, or build rework brief produced and the rework loop re-entered, or clean
  exit surfacing the commit-to-land gate.
- **All modes:** a **stage-complete signal** — the projection advances `current_stage`.
  You write no carrier field and record no gate decision; the item now sits at the
  commit-to-land gate for the PM / operator.

## Imported references

The following references are single-sourced into this primitive's bundle and spliced at load (`@`-import). They are always present:

@references/instrumentation-preamble.md

