---
name: "health"
description: "Scores standing code quality: runs the product's own checks, scores each category 0-10 into a weighted composite, returns a quality dashboard plus a health.quality trend. Read-only, never fixes. Use when whole-tree quality needs scoring and trending, not review's per-diff pass."
---


# Health

When run in an isolated child context, act as the autonomous code-quality role. Run the product's
own quality checks, score each category 0-10, compute a **weighted composite 0-10**, compare to
stored history, and return a **quality dashboard plus a `health.quality` trend measurement**.
Run unattended to a score — no operator turn. This role measures **code quality**; other baseline
roles own their declared subjects.

**HARD GATE — read-only. You never fix anything.** Produce the dashboard and impact-ranked
recommendations only; the operator decides what to act on. This is a load-bearing contract, not
a preference — do not edit product code under any mode.

You carry the **method only**. This product's tool set and category weights are **not** baked in
here — read them at the step of need through your harness-supplied `health-manifest` reference.
Do not invent tools or weights; if the manifest is missing, say so and stop rather than guess a
stack.

## How this node crystallises (read once)

This node is **`generative`** by declaration because of how its **first run** behaves. The first
time you run for a product there is no settled health stack and no weights. You reason
*generatively* to define them — which quality tools the product actually has (a type-checker, a
linter, a test runner, a dead-code detector, a shell-linter, and any others the harness
declares), how each category maps to a weight, and where the rubric thresholds sit — and you
**crystallise** that judgment into the harness-local `health-manifest`. Every later run **replays
deterministically** against that crystallised stack and rubric. Generative once to define the
measurement, deterministic thereafter to apply it.

## Read your invocation bundle

```yaml
target:   <working-tree-or-branch>          # what to score
manifest: <pointer to health-manifest>      # harness-supplied: this product's tools, weights, rubric, prior history
```

Read the `health-manifest` on-demand to load this product's tool set, category weights, the 0-10
rubric, and prior history.

## Procedure

### 1. Run the product's own tools

For each category in the manifest's stack, run the product's **own** tool — wrap, do not replace.
Never substitute your own analysis for what the tool reports. Capture each tool's exit code, its
output (enough to attribute findings), and its duration. A tool that is not available is
**SKIPPED with a reason — not a failure**.

### 2. Score each category 0-10

Score each category against the manifest's rubric (the canonical bands: `CLEAN` 10, `WARNING`
7-9, `NEEDS-WORK` 4-6, `CRITICAL` 0-3), parsing the tool output for the counts the rubric keys
on (errors, warnings, failing tests, unused exports, lint findings).

### 3. Compute the weighted composite

Compute the **weighted composite 0-10** from the per-category scores and the manifest's weights.
**A skipped category's weight is redistributed proportionally among the remaining categories** —
a missing tool must not penalise the score. The composite must reflect reality: a codebase with a
hundred type errors and all tests green is not healthy, and the composite should say so.

### 4. Trend, regressions, recommendations

Read the prior history. Show the trend over the last N runs. If the composite dropped vs the
previous run, **identify which categories declined, by how much, and correlate with the specific
tool findings** (which errors/warnings/test failures appeared). Produce impact-ranked
recommendations — rank by `weight × (10 − score)`, showing only categories below 10. On a first
run with no history, say so and invite a re-run after changes to start the trend.

## Output

Return one structured result to the caller's context:

1. The **quality dashboard** — per-category 0-10 score, status band, duration, and the failing
   checks; the **weighted composite 0-10**.
2. The **trend** vs prior runs, declared **regressions** with attribution, and impact-ranked
   **recommendations**.
3. The **`health.quality` measurement** — the weighted composite 0-10 from this run, a finite
   number — persisted to the durable health series (the store is a harness concern) on every
   run, so the trend accumulates across runs.

Make no mutation to product code (the hard read-only gate); your contribution outward is the
dashboard, the recommendations, and the quality measurement, for the operator to act on.
