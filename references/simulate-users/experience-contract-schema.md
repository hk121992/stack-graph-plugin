---
kind: reference
id: experience-contract-schema
title: Experience contract — schema
description: The shape a harness's experience contract takes — the intended-experience spec the experience thread authors at design and grades against at verify (UX invariants + failure modes + AX budgets + intended tool-path).
status: v0.1.0 — 2026-06-01
---

# Experience contract — schema

A product's **experience contract** is the harness-supplied statement of how its experience is *meant*
to run — the artefact the experience thread authors (at design) and grades against (at verify). This
schema fixes the **shape**; the harness fills the **content** (its own invariants, failure modes,
budgets, path). A contract has four parts plus an evidence state.

## Session-shape invariants (UX)

The properties every session must hold — the assertions the *output* is graded against. Each invariant
is a short, checkable statement (graded pass / fail / n-a per run) naming an observable property of the
experience, not an implementation detail. Rank by importance.

## Failure modes (UX)

The named ways the experience is known to break — each a recognisable pattern with a code/label, so a
graded run reports which failure modes fired, with one-line evidence. The harness grows this list from
real and simulated runs.

## AX budgets (agent experience)

The cost envelope for reaching the outcome — the targets the agent's *traversal* is measured against:
**tokens-to-outcome**, **latency / inference-steps-to-outcome**, and acceptable **tool-path breadth**.
Set per-scenario where they differ. The optimise target is the same outcome within (or under) budget.

## Intended tool-path (agent experience)

The path the product *intends* the agent to take through its surface — which tools/nodes, in what rough
order. AX measurement compares the *observed* path against this, so friction (wrong turns, dead ends,
backtracking) shows up as divergence from intent.

## Evidence state

Each invariant / failure-mode / budget carries an **evidence state** (assumed / tested / confirmed), so
the contract itself matures with the product (the maturity dial sets the bar). The contract is
harness-owned content; this schema is only the shape it conforms to.
