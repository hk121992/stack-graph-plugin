# Objectives (OKRs)

<!-- Authored per okr-schema (v0.2.0). Outcomes, never features. Every work-item -->
<!-- outcome_link ladders to an objective -> the vision apex. Maturity: pre-launch. -->

## Vision

- **statement:** Every agent operating environment can be modelled, comprehended, and
  improved through its `.claude` primitives and the workflows that traverse them — by the
  operators who run it, not the engineers who built it.
- **horizon:** 2–3 years

## Objectives

### obj-activate-factory — Activate the factory loop end-to-end

Pre-launch maturity. The bottleneck is factory activation, not optimisation — nothing else
delivers value until the loop runs. The objective is the *outcome* (an operator can exercise
the whole cycle), not any single feature that enables it.

- **key_results:**
  - `{ metric: "graph nodes authored, validated, and indexed", target: "100% of backbone wave 1", current: "done — 28 nodes (D50)" }`
  - `{ metric: "loop traverses end-to-end (smoke test)", target: "all 5 backbone stages reachable", current: "done — D50" }`
  - `{ metric: "plugin vendor pipeline ships nodes into skills/", target: "skills/ populated from graph/", current: "in progress — vendor.ts builds the plugin tree" }`
  - `{ metric: "harness build (a consuming overlay exercises the loop)", target: "a harness wired + loop run", current: "not started" }`
- **north_star_link:** directly moves the north-star — a correctly closed record entry is the proof the loop ran.
- **maturity_note:** pre-launch — measured by operator assertion + smoke test; no user signal yet (that is the input gate for the progress-analytics layer).

### obj-harness-ready — A consuming workspace can install and customise the factory

A second workspace can install the plugin, apply an additive overlay with its own bindings +
surfaces, and run the loop against real work items without modifying the factory. The objective
is the business outcome — the factory/product split holds at the seam — not the install feature.

- **key_results:**
  - `{ metric: "plugin build ships clean", target: "vendor build exits 0 with all nodes vendored", current: "in progress" }`
  - `{ metric: "harness bindings + surfaces wired", target: "all required binding keys populated", current: "not started" }`
  - `{ metric: "OKR + strategy gap filled for the harness surface", target: "objectives.md + strategy.md authored", current: "in progress" }`
  - `{ metric: "experience thread designed", target: "persona-JTBD-scenario layer spec'd + nodes authored", current: "in discovery" }`
- **north_star_link:** lags the north-star — a real consuming harness is what proves the loop value generalises beyond the factory.
- **maturity_note:** pre-launch — measured by a successful harness install + loop run; no external users yet.

## North-star

A practitioner can install the stack-graph plugin into any Claude workspace, run the full
dev-sprint loop against a real work item, and observe a correctly closed record entry —
*without* reading the source code. It is the single metric that best proxies delivered value:
it captures the whole loop working, and it is the apex both objectives ladder to.
