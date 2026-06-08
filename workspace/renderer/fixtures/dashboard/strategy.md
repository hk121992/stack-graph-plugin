---
title: "Vision & strategy"
description: "Where we're going — the apex of the outcome layer."
status: "active — 2026-06-02"
---

# Vision & strategy

> **Vision:** Every agent operating environment can be modelled, comprehended, and improved through its `.claude` primitives and the workflows that traverse them — by the operators who run it, not the engineers who built it.

This is a **factory**, not a product. The factory's output is the *capability* for a product workspace to run a structured improvement loop. stack-graph does not ship features to end users; it ships the infrastructure that lets a team ship features *deliberately*.

---

## Guiding policy (Rumelt's kernel)

**Diagnosis:** Agent workspaces accumulate `.claude` primitives ad-hoc — skills, agents, references, hooks — without a shared model of how they compose. Operators can't reason about what they have, what's missing, or how to improve it. The bottleneck is *comprehension and instrumentable structure*, not raw capability.

**Guiding policy:** Model the operating environment as a graph of its primitives. Make that graph the authoring lens, the comprehension surface, and the improvement loop driver — all from the same source of truth.

**Coherent actions:**
- Author nodes as canonical `.claude` primitives with graph frontmatter (not a separate store).
- Vendor the graph as a plugin; harnesses overlay — never mutate.
- Instrument traversals; project carrier state from the event log; never hand-curate derived state.
- Build surfaces that render the graph, not duplicate it.

---

## Who & the job (JTBD)

**Operator (primary):** A practitioner building and running a Claude-powered product workspace. Their job: *"When I'm running an AI-native product team, I need to keep my agent operating environment coherent so every sprint produces deliberate, traceable work — not ad-hoc tool calls I can't audit or improve."*

**Harness builder (secondary):** A developer instantiating the factory for a specific product workspace. Their job: *"When I'm adopting stack-graph for my workspace, I need to install the plugin, apply my overlay, and run the loop — without forking or modifying the factory itself."*

---

## Open questions (what discovery is chasing)

1. **Plugin install UX** — What is the smoothest `bun run install-plugin` experience for a harness builder who has never seen the factory?
2. **Overlay boundary** — Where exactly does the factory end and the harness begin for edge-case configurations (MCP-heavy workspaces, multi-product monorepos)?
3. **Event log format** — Is the current `.stack-graph/` event log shape sufficient for the projection mechanism, or does it need a richer schema for multi-carrier concurrency?
4. **Analytics seam** — Can factory conformance analytics and product outcome analytics share the same instrumentation machinery without namespace collision in practice?

---

## Decided / not-doing

- **Not a product itself.** stack-graph does not serve end users; it serves operators. Feature requests that assume an end-user audience are out of scope.
- **Not a task tracker.** The work ledger tracks *carrier state and deliberate decisions* — not sprint velocity, not individual tasks. Task boards are the consuming product's concern.
- **Not hardcoded to any product.** Every product-specific detail (personas, OKRs, work items) lives in the harness overlay, never in this repo.
- **Not a DAG.** The graph is cyclic (loops are first-class). Designs that assume a directed acyclic structure will be rejected.
