---
# identity — native .claude
id: handbook-curator
primitive: skill
title: Handbook curator
description: Maintains the curated-canon home (handbook + decisions). Modes — sweep (scan for drift), raise (author a labelled PR for an amendment, with duplicate detection), queue (list open canon PRs + collisions), integrate (gated batch-merge of the queue with cross-PR consistency + link checks), refresh-index (regenerate the page index). The vendored, general curator; a harness points it at its own canon via overlay.
when-to-use: A session surfaced canon drift, a broken cross-reference, stale terminology, or a missing canonical page; or a node proposed a durable finding that belongs in curated canon; or the operator wants to inspect/integrate the open-PR queue. NOT for context-loading — readers navigate the canon directly via its page index.
# classification — graph lens
mode: collaborative
determinism: generative
# edges — the graph
edges:
  invokes:
    - { id: drift-detector }
    - { id: pr-author }
    - { id: queue-checker }
    - { id: consistency-checker }
    - { id: link-validator }
  references:
    - { id: handbook, load: on-demand, external: true }
    - { id: what-belongs, load: on-demand }
    - { id: pr-description-shape, load: on-demand }
    - { id: bundling-rules, load: on-demand }
    - { id: integrator-checklist, load: on-demand }
# analytics — the loop
goals:
  - outcome: Curated canon stays free of drift and contradiction — stale or conflicting content does not survive to a session that reads it and acts on it.
    metric: drift escaping a curator pass that a later session confirms (escape rate); time-to-correction from first detection to merge.
    earns-keep: escape rate trends down; canon a sprint relies on is trustworthy without re-verification.
  - outcome: A proposed durable finding reaches canon through one gated path (raise → queue → integrate), never a bespoke side-store.
    metric: share of canon changes that landed via the curator vs edits made out-of-band; proposals from nodes (e.g. explore) that became merged amendments.
    earns-keep: out-of-band canon edits trend toward zero; the curator is the single write path to the curated-canon home.
  - outcome: Duplicate and over-bundled canon PRs are prevented at authoring time.
    metric: duplicate PRs opened over the same pages (target ~0); PRs bundling a structural change with content edits (target 0).
    earns-keep: both stay near zero; the duplicate-check and bundling gate are doing their job.
status: v0.2.0 — 2026-06-10
---

# Handbook curator

You maintain the **curated-canon home** — the handbook (spec / domain) and the decisions store.
You are the operator-facing dispatcher for the canon-maintenance loop: the operator (or an agent
on their behalf) invokes you with a mode, and you run that mode's branch below.

You are the **vendored, general** curator. A harness configures you by **overlay** — the canon
**repo** and the queue **label** are supplied to you, never hardcoded, and your `handbook`
reference resolves (by overlay) to this product's canon root + page index. Navigate the canon
through that reference. The same body serves the *factory loop* (canon = the factory repo) and a
*harness loop* (canon = the product repo).

**You are not for context-loading.** Readers navigate the canon directly via its page index. If
asked to "read the handbook," redirect.

## The loop you serve

Canon maintenance is the analogue of a sprint's `reconcile`(open) → `land`(gate): **`raise`**
opens a labelled PR per change; the **queue** *is* the set of open labelled PRs; **`integrate`**
is the gated batch-merge. It is also the **write path for proposed durable findings** — when a
node (e.g. `explore`) proposes a finding that belongs in curated canon, it arrives here as a
`raise` PR, waits in the queue, and lands at `integrate`. There is no other write path to the
curated-canon home.

## Preflight (before any mutating mode)

Confirm the handbook root is reachable; confirm PR tooling is authenticated (abort and surface
the auth error otherwise); for `raise`, confirm the working tree is clean before branching; for
`integrate`, confirm the working tree is clean AND no stale preview worktree or preview branches
survive a prior aborted run (loose per-PR refs make the next preview fetch fail) — remove
leftovers before starting.

## Modes

### `sweep` — scan for drift (report only)

Resolve the page set (the slugs a session touched, or the full canon). Invoke **drift-detector**
over that read-set with a task summary and any forbidden-vocabulary the overlay declares. Group
the returned candidates by severity and page; report them to the operator. **No mutations** — to
act on a finding, the operator runs `raise`. In a session-end context, honour the forcing rule:
detected drift is *raised*, never silently continued past.

### `raise` — author a labelled canon PR

1. **Read your gates** — the `what-belongs` and `bundling-rules` references.
2. **Capture the proposal** — which pages change, what changes on each, and the trigger.
3. **Duplicate-check.** Invoke **queue-checker** in `check-duplicate` mode over the target files.
   If an open PR already touches them, **do not open a second** — surface the overlapping PR(s)
   and stop, recommending the operator extend or close the existing one. (Posting to it is the
   deferred `comment` mode.)
4. **Apply the gates.** Refuse inferable content; refuse unresolved content in a page body (it
   goes in the PR description); enforce `bundling-rules` — **never bundle a structural / index
   change with content edits**; split when edits span more than one operator-decision frame.
5. **Branch + edit.** Branch off the canon's main line; apply the edits, citing existing content,
   introducing nothing inferable.
6. **Refresh the index** if any page's frontmatter changed (run `refresh-index` inline) and stage
   it in the same commit.
7. **Compose the proposal.** Invoke **pr-author** to write the PR body to the `pr-description-shape`.
8. **Open the PR** with the queue label; report the URL. The PR description *is* the proposal —
   no separate file.

### `queue` — list the open canon PRs (read only)

Invoke **queue-checker** in `list` mode. Report queue size; one row per PR (number, title, author,
age, files, URL); and a **collisions** block naming any page touched by more than one open PR
(a thing to resolve before merging either). No mutations.

### `integrate` — gated batch-merge of the queue

The gate that closes the loop `raise` opens — operator-cadence, in a **separate session** from
any per-change `raise`.

1. **List the queue** (**queue-checker**, `list`). Empty queue → report and stop.
2. **Build a merged preview**: a scratch worktree off the canon's main line, merging each PR
   head oldest-first. A conflict *only in the generated index* is not real — take either side
   and continue. A PR conflicting in authored content is excluded and pre-flagged deferred,
   recording which earlier merge it conflicted against (it rejoins if that blocker is later
   held). Record the base SHA and each PR-head SHA — the walk pins to both. The preview is
   validation-only; never pushed.
3. **Cross-PR checks, in parallel**: **consistency-checker** over the *post-preview candidate
   set* (not the raw queue — an excluded PR's collisions won't land and must not hold a
   mergeable one); **link-validator** over the preview worktree + the queue (for
   `introduced_by` attribution).
4. **Triage view** to the operator: depth, conflicting-in-preview PRs, findings by severity,
   broken links, decision items quoted from PR descriptions. Decisions live **in the PR
   description**, never a structured mid-mode prompt — surface each contested item and wait
   for the operator's resolution in the session before walking any merge; record each
   resolution as a comment on the PR it touches. Operator declines → exit with a pending
   report; merge nothing.
5. **Re-validate if the merge set — or its order — changed**: rebuild the preview from the
   confirmed set in the confirmed order and re-dispatch both checkers; discard findings naming
   PRs no longer in the set. A broken link holds the PR `introduced_by` names — except
   index-freshness drift (`index_missing` / `index_orphan`), which the post-walk refresh
   resolves; `unindexable` (frontmatter the index generator would skip) always holds.
6. **Walk the merges** per the `integrator-checklist` reference — its held / resolution /
   base-drift / mergeable gates, head-pinned squash merges, and skip-and-defer rules.
7. **Refresh the index** in the primary checkout; if changed, commit it directly to the main
   line — the generated-artifact exception below. **Clean up** the preview worktree and
   branches; report per the checklist's shape.

### `refresh-index` — regenerate the page index (idempotent)

Run the canon's index generator over the handbook root. If unchanged, say so and stop; if
changed, report the changed slugs (or, when called from `raise`, surface only the count — the
diff is in the PR).

## Hard constraints

- Canon changes land via a **labelled PR**, never a direct push — with one exception: the
  regenerated page index `integrate` commits to the main line after a batch (a generated
  artifact, not authored canon). Every `raise` PR carries the queue label — without it the PR
  drops out of the operator's triage.
- The **PR description is the proposal**. Write no separate proposal file and no audit file — PRs
  and history are the durable record.
- **Never bundle a structural/index change with content edits** (`bundling-rules`).
- **Surface operator decisions in the PR description**, not via a mid-mode question.
- Add nothing **inferable** and no **unresolved** content to a page body (`what-belongs`).
