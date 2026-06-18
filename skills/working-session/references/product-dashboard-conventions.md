---
kind: reference
id: product-dashboard-conventions
title: Product-dashboard conventions — how the front authors work-ledger content
description: The content conventions the front follows when authoring product-dashboard work-ledger content (carriers) — the write-boundary (content only; never projected stage, gate-written lifecycle, or gate decisions), the problem-framed-and-laddered + durable-record invariants, raise-creates / edit-advances, and graduation via a labelled PR. Canonical so they hold whether or not a dedicated curator skill enacts them.
status: v0.2.0 — 2026-06-18
---

# Product-dashboard conventions

The conventions the front follows when it authors **work-ledger content** — the work items
(carriers) on the product-dashboard. They are imported wherever the front creates or advances a
carrier: `raise` at create, the working session as it shapes, a dashboard `edit` at a terminal
disposition. They live here, in canon, so they hold the same way **regardless of which node enacts
them** — a dedicated curator skill, or the front nodes directly.

## The content/state write-boundary (the hard line)

The carrier (`work-item-schema`) splits by **who writes each field**. Content authoring writes the
**content half only**:

- **Author CONTENT** (the deliberate "why"): the problem/opportunity statement, `outcome_link` (the
  OKR it serves), `value_prop_link` (the VPC job/pain/gain), `risk_state` (the four-risks evidence
  state), `tier` (the per-item dial override), the solution summary (only once `committed`), `links`
  (spec / build PRs / experience-contract / debrief), `disposition` (for parked/killed), and the thin
  sprint-record beside the ledger.
- **Never write `current_stage`** — it is **projected** from the traversal (operator-overridable),
  derived, never authored (`carrier-interface`, `work-item-schema`).
- **Never advance `lifecycle_state`** — it advances **only at a gate** (operator go/no-go). Render an
  item under its current zone; never move it.
- **Never decide or append a `gate_decision`** — those are operator-appended at each gate.

A request to advance a stage, pass a gate, or mark an item shipped/live is **surfaced as an
operator/gate action**, not performed. The boundary is **structural** (`carrier-interface`):
projection owns the stage, gates own the lifecycle — so it holds independently of any one writer.

## The two content invariants

- **Problem-framed until committed, and laddered to an outcome.** A work item carries a *problem /
  opportunity*, not a pre-committed feature, through the forward view; the solution summary is
  populated **only once committed**. Every `outcome_link` is an **authored** link to a real objective
  (never inferred), so the by-contribution rollup is trustworthy. An item that can only be stated as a
  feature, or that ladders to nothing, is not ready.
- **Nothing is destructively lost; the record is durable.** Killed and parked items are **retained
  with a `disposition`** (the anti-portfolio learning record); record content (problem, links,
  `risk_state`) is **kept once an item ships**. A work item is **never deleted**.

## Create, advance, graduate

- **`raise` creates** a carrier (a WI or a standalone IU) — the front's create action: identity +
  initial content, placed by content in the forward view, never by setting lifecycle (a gate does
  that) or stage (projected).
- **`edit` advances** an existing carrier's content — including the **terminal disposition**: a WI the
  working session resolves as not worth an IU is parked / killed / deferred here, carrying its
  `disposition` (`work-item-schema`).
- **Graduate via a labelled PR.** Group content edits in one operator-decision frame into one PR;
  split across frames; **never bundle a structural ledger change with content edits**
  (`bundling-rules`). Duplicate-check the open queue before opening. The PR description **is** the
  proposal — no separate file. Content changes land via the labelled PR, never a direct push.

## Curator removal — operator-accepted gaps + write-boundary note (wi-unified-front-workflow IU-7)

The dedicated `product-dashboard-curator` skill is removed; these conventions now hold via the front
nodes directly (`raise` at create, the working session as it shapes, a dashboard `edit` at a terminal
disposition). The removal carries operator-accepted gaps, recorded here as the durable home:

- **Operator-accepted gaps.** The curator's `queue` read-model is **dropped** (a follow-on if the
  open-PR view is needed again). The curator's `reprioritise` / `sprint-plan` grooming is **orphaned**
  until the upstream stand-up subsumes it. **Reversal cost:** re-instating either means **re-vendoring
  a removed *general* skill across every consuming harness** if the stand-up slips — the removal is
  cheap to make but expensive to undo, so it is taken deliberately, not reflexively.
- **Write-boundary note (SEC-1).** After the curator's removal, `lifecycle_state` and `gate_decisions`
  are **convention-guarded only** — the structural projection covers `current_stage` alone, so the
  hard line above (never advance `lifecycle_state`, never append a `gate_decision`) is now enforced by
  convention rather than by a writer-side guard. This residual integrity risk is **recorded here**
  rather than mechanically guarded. A follow-on may add a `vendor:check`-time guard asserting that a
  non-gate content edit touches neither field.

## Related

- `work-item-schema` — the carrier whose content these conventions author (the three-kinds-of-state
  discipline this boundary preserves).
- `carrier-interface` — the structural write-boundary (projection + gates) these conventions ride.
- `okr-schema` — the objective an `outcome_link` resolves to.
- `bundling-rules` — when to bundle vs split a content PR.
