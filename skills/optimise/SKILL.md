---
name: "optimise"
description: "Generates N variants of a span in parallel worktrees, measures each, and selects the best that still passes its gate. Modes: perf (benchmark; fastest correct) and AX (simulate-users; cheapest in tokens/latency). Use when a built span inside build has a measurable objective and correct baseline."
---


# Optimise

You are the **generate-measure-select** primitive — a sub-arc `build` reaches into for a unit whose
objective is worth improving. The caller hands you a **target span** of an implementation and a
**measurable objective**; you generate **N variants** of that span in parallel isolated worktrees,
**measure** each with the mode's evaluator, and **select** the winner — the variant that best
improves the objective while still passing its **gate**. Your round's spend was declared upstream:
the **planned variant count N**, the objective, and the gate arrive in `build`'s kick-off bundle —
recorded in the shaped scope at the front, carried by the always-AFK build — so you confirm
nothing mid-span; you run the declared round.

You **generate, measure, and select — you do not fix.** A failure surfaced during measurement (a
variant that breaks correctness, a UX invariant that fails) is reported, not repaired here;
repairs route back to the caller (`build`). Your one output is the best variant that still passes
the gate, plus the comparison that justifies the choice.

## The kick-off bundle

Read the caller's bundle — declared upstream in the shaped scope, never negotiated mid-span:

1. **Target span** — which files (perf mode) or which product-agent instructions /
   knowledge-graph (AX mode) the variants will rewrite. This is the scope boundary; variants stay
   inside it.
2. **Mode** — `perf` (default) or `ax`. The mode picks the evaluator and the selection rule below.
3. **Objective + gate** — perf: the perf metric to minimise + a correctness check every variant
   must pass. AX: the experience contract supplies the **UX gate** (invariants + failure modes)
   and the **AX budgets / baseline** — read through your `experience-contract` reference
   (external, harness-bound); the caller supplies the persona × scenario bundle.
4. **Variant count N** — the planned N for this round, declared upstream. It is bounded by
   construction (cost is N × generate + N × measure); 2–4 is typical.
5. **Baseline** — the current implementation is the baseline every variant is scored against. If
   the baseline does not pass its own gate, **stop** — optimise improves a *correct* baseline; a
   broken baseline routes back to `build` first.

## Generate — N variants in parallel isolated worktrees

Variants are alternative implementations of the **same** span, so they touch the **same files by
construction** — they would collide catastrophically in a shared directory. Each variant therefore **must**
run in its own isolated worktree.

- **Dispatch one variant-author worker per variant**, in parallel, each in a native `isolation: 'worktree'`
  checkout (script fallback where the native mechanism is unavailable). Each worker gets: the target span,
  the objective, the gate, and a distinct **strategy hint** so the variants actually differ (e.g. different
  algorithm, different decomposition, different instruction phrasing) — N near-identical variants waste the
  round.
- Worktree isolation also eliminates **git-index contention and test interference**, which make
  shared-directory concurrency unsafe even when the worktree mechanism is available.
- Each worker authors its variant within its own branch and reports back: the variant is ready to measure.

## Measure — score each variant with the mode's evaluator

Run the branch for the declared mode. **Measure every variant against the same baseline, in one round.**
Show the measurements — never assert them.

### perf mode (default) — evaluator: `benchmark`

1. For each variant, run its **correctness check** first. A variant that fails correctness is
   **disqualified** before any speed comparison — never select "faster but broken."
2. For each variant that passes correctness, **invoke `benchmark`** to measure the perf metric. Treat
   `benchmark` as a black-box evaluator: optimise does not know whether the metric is latency, throughput,
   or bundle size — it reads back the score and the delta vs the baseline.
3. Build the comparison: one row per variant — the perf metric, the delta vs baseline, and the
   correctness result — shown, not summarised.

**Selection rule:** keep the **fastest variant that still passes correctness**. If no variant beats the
baseline, select **baseline unchanged** and say so — a round that finds no improvement is a valid result.

### AX mode — evaluator: `simulate-users`

1. For each variant, **invoke `simulate-users`** against it (re-simulate the variant) with the persona ×
   scenario bundle and the experience contract. One run returns a **UX verdict** (pass / fail per invariant
   and failure mode) and an **AX profile** (tokens-to-outcome, latency/steps-to-outcome, the tool-path, and
   ranked friction).
2. The **UX verdict is the gate.** A variant whose UX verdict **fails** any contract invariant is
   **disqualified** — never select "cheaper but broken UX," exactly as perf mode never selects
   "faster but broken."
3. For each UX-passing variant, read its **AX cost** (tokens / latency / tool-path) from the profile and
   the delta vs the AX baseline.
4. Build the comparison: one row per variant — the AX cost, the delta vs baseline, and the UX verdict.

**Selection rule:** keep the variant with the **lowest AX cost among those whose UX verdict still passes**
the experience contract. The objective is *the same outcome for fewer tokens and faster*; UX-pass is the
gate, AX-cost is what you minimise. If no variant cuts cost while passing UX, select **baseline unchanged**.

## Select — merge the winner, discard the losers

1. **Merge the selected winner** into the working tree from its worktree branch.
2. **Tear down the worktrees** for every variant (winner after merge; losers discarded). The teardown is
   **order-bearing — do not reorder:**

   1. Run the test suite on the merged result (winner only).
   2. Unlock the worktree: `git worktree unlock <path>`.
   3. Remove the worktree: `git worktree remove <path>`.
   4. Delete the branch.

   **SAFETY — winner vs loser branch deletion.** For the **winner**, whose work is merged, use
   `git branch -d <branch>` (lowercase): it refuses to delete a branch whose commits are not merged, and
   that refusal is the guard against losing merged work silently. A **losing variant** is deliberately
   discarded unmerged, so `-d` will refuse it — force-delete a loser only after it is named as a loser in
   the comparison record: the record is the audit that it lost and is deliberately discarded. **Never
   blanket-`-D`** every branch to "clean up" — that destroys a winner whose merge silently failed. Omitting
   the teardown leaves orphan branches and locked worktrees accumulating silently.

3. **Surface the comparison record** — every variant's measurement + gate result against the baseline — so
   the select decision is auditable.

## Output

- **The selected winner** merged into the working tree — or **baseline unchanged** when no variant beat it.
- **The comparison record** — per variant: objective measurement, delta vs baseline, gate result; shown,
  not asserted — the justification for the select decision.
- **Losing variants discarded** — worktrees torn down, branches not merged.
- **No carrier field written; no gate touched.** No product fix and no discovery: a failure found
  during measurement routes back to the caller (`build`), never repaired here.
