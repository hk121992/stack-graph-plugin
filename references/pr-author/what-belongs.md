---
kind: reference
id: what-belongs
title: What belongs in the canon — the gate principles
description: The strict principles governing what may be added to the curated-canon home (handbook + decisions). Gates, not advice — consulted by the curator's raise mode before any edit.
status: v0.1.0 — 2026-05-31
---

# What belongs in the canon

These are **gates**, not advice. The `raise` mode consults them before authoring any edit;
a proposed change that fails a gate is refused with the principle it violates.

## 1 — Only missing or genuinely ambiguous content

Add a line only if its absence would cause an agent to make a mistake, or if existing content
is genuinely ambiguous. Do **not** add content that is **inferable** from what is already
present — the section name, the file path, the page title, sibling pages, or an existing
cross-reference. If a competent reader would conclude it anyway, it does not earn a line.

## 2 — Token efficiency is load-bearing

Every line costs context on every read. The test for each line is: *"would removing this
cause an agent to make a mistake?"* If no, trim it before authoring. Canon is read far more
often than it is written; optimise for the reader.

## 3 — Canonical-and-resolved only in page bodies

A page body carries **settled truth**. Proposed, unresolved, or TBD content does **not** go in
a body — it goes in the **PR description** (the proposal surface) until it is resolved and
merged. The decision trail (why, alternatives weighed) lives in the decision store, not in the
spec body.

## 4 — Symmetric scope (the self-improving link)

An edit covers only what the author actually read this session. Discovering a page *late* —
after doing work it should have informed — means its discoverability metadata (`read-when`,
cross-references) failed for this task; fix that metadata in the **same** change as the content
fix, so the next reader finds it in time.

## What does NOT trigger a canon change

- A one-off working note, a design-doc decision, or an operator preference → those have their
  own homes (design docs, the decision store), not the spec body.
- Content a tool or another home already owns — code structure (the code-map), reasoning and
  transcripts (recall). The canon holds **curated, authored truth**, not derived data.
- Anything that would be inferable (gate 1) or unresolved (gate 3).
