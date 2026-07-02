---
subject: experience-contract-schema
title: Experience-contract schema
provenance: vendored
level: L2
cadence: on-demand
read-when: "Authoring or grading an experience-contract."
derive-from: [experience-contract-schema]
reviews-on: experience-contract-schema-source
last-reviewed: unset
entropy: unmeasured
status: drafted
related: [okr-schema, axis-entry-schema]
---

# Experience-contract schema

The **shape** a product's experience-contract conforms to — the harness-supplied statement of how its
experience is *meant* to run, **authored at design and graded at verify** (the two ends of the experience
thread). This reference fixes the **shape**; the harness fills the **content** — its own invariants, failure
modes, budgets, and path — on its local `experience-contract` instance. A contract has **four parts plus a
per-element evidence state**.

## The four parts {#four-parts}

- **Session-shape invariants (UX)** — the properties every session must hold, the assertions the *output* is
  graded against. Each is a short, **checkable** statement (graded pass / fail / n-a per run) naming an
  observable property of the experience, not an implementation detail. Ranked by importance.
- **Failure modes (UX)** — the named ways the experience is known to break; each a recognisable pattern with a
  machine-stable **`code`** + a human **`label`**, so a graded run reports which modes fired, with one-line
  evidence. The harness grows the list from real and simulated runs.
- **AX budgets (agent experience)** — the cost envelope for reaching the outcome: **tokens-to-outcome**,
  **latency / inference-steps-to-outcome**, and acceptable **tool-path breadth**. Set per-scenario where they
  differ; the optimise target is the same outcome within budget.
- **Intended tool-path (agent experience)** — the path the product *intends* the agent to take through its
  surface (which tools/nodes, in what rough order). AX measurement compares the *observed* path against this, so
  friction — wrong turns, dead ends, backtracking — shows up as divergence from intent.

## Evidence state {#evidence-state}

Each invariant, failure-mode, and budget carries an **evidence state** — `assumed | tested | confirmed` — so the
contract **matures with the product** (the maturity dial sets the bar). The contract is harness-owned content;
this schema is only the shape it conforms to.

## Cite out {#cite-out}

- **The instance** — the harness's filled `experience-contract` (an external harness surface, overlay-resolved), runtime → the **harness-topology** spec (local, per-consumer) · bindings-contract.
- **The experience thread** that authors it (design) and grades it (simulate-users) → those nodes.
