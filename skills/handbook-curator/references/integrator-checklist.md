---
kind: reference
id: integrator-checklist
title: Integrator checklist
description: The merge-walk discipline for the curator's integrate mode — hold/resolution/base-drift/mergeable gates, head-pinned squash merges, the post-batch index refresh (the one sanctioned direct commit), preview cleanup, and the report shape.
status: v0.1.0 — 2026-06-10
---

# Integrator checklist

The merge-walk discipline for `integrate`. The dispatcher follows this once the triage view is
on the table and the operator has resolved every contested item. The canon **repo** and queue
**label** come from the overlay; "the index" is the canon's own page index and generator.

## Ordering

1. Default: **oldest-first within each topical cluster** (PRs touching the same pages or
   concept form a cluster; the consistency-checker's collision findings define them). The
   operator may override per cluster.
2. A `file_collision` or `stale_against_batch` finding fixes the order *within* its cluster:
   the PR the recommendation names first merges first; the later PR is re-checked for
   mergeability against the post-merge main line before its own merge.
3. A `frontmatter_collision` means at most one structural PR merges this session; the rest
   defer to the next integrate.

## Per-merge steps

For each PR, in the confirmed order:

1. **Held?** If a finding's accepted recommendation said "amend this PR before merge", it is
   *not* merged this walk — skip the remaining steps; defer with the amendment as the recorded
   reason.
2. **Resolutions recorded?** Every operator resolution that touched this PR — a decision-item
   answer, a vocabulary pick, a merge-order or override call — is posted to the PR as a comment
   before merging ("Integrate <date>: <resolution>"). PRs and history are the durable record —
   a decision that lives only in chat is lost.
3. **Base-drift gate.** Head-pinning protects the PR head, not the base: if the canon's main
   line advanced past the recorded preview base for any reason *other than this walk's own
   merges*, the batch would land on a page set the preview never checked. Refresh the remote
   refs fully (a bare single-branch fetch can leave the compared ref stale), then verify the
   commits since the preview base are exactly this session's merges; anything else → stop the
   walk, rebuild the preview from the new base, re-validate.
4. **Mergeable gate.** Query the PR's mergeable state. An *unknown* state is transient — the
   host recomputes after every merge to the main line — so re-query a few times before judging.
   A conflict **only in the generated index** is not a real conflict (an earlier merge in this
   walk regenerated it): resolve on the PR branch by merging the main line, taking its index,
   re-running the index generator, pushing the branch, and re-pinning to the new head (no
   re-validation — only the generated file changed). Any other terminal conflict → skip and
   defer with the state value. Gate on the merge-*state* too: a PR can be conflict-free yet
   blocked by required checks, reviews, or draft state — also a skip-and-defer, so the walk
   never dies mid-merge.
5. **Merge — pinned to the validated head.** Squash-merge, pinned to the head commit the
   preview was built from (recorded at preview time; with `gh`, `--match-head-commit <sha>`),
   deleting the branch. If the PR moved since validation the merge fails cleanly: re-validate
   that PR (or rebuild the preview) rather than merging unvalidated content. Squash is the
   default — one canon change per PR → one commit; the operator may ask for a merge commit on
   a PR whose individual commits matter.

## After the walk

All of this runs in the **primary checkout** — preview-building left the shell in the scratch
worktree, so return first.

1. Return to the primary checkout; update the main line. Confirm local main is exactly the
   remote's — if it is ahead, stop before step 3: the sanctioned direct push covers the
   generated index only, and pushing would smuggle unpushed commits past the PR-only
   constraint.
2. Run the canon's index generator. Each `raise` PR refreshed the index against *pre-merge*
   main, so a batch can leave it stale even when every PR was individually clean.
3. If the index changed, stage **only the index**, commit to main
   (`chore(<canon>): refresh index post-integrate`) and push. This is the one sanctioned
   direct push — the index is a generated artifact, not authored canon. An unpushed index
   commit defeats the point: future runs read the remote.
4. Remove the merged-preview worktree and **all** preview branches — the preview branch and
   every per-PR ref (a stale per-PR ref makes the next run's fetch of an amended PR fail
   non-fast-forward). List-then-delete by the preview naming pattern; never glob loosely
   enough to catch unrelated branches.

## Report shape

End the session with, in order:

- **Merged** — count + PR URLs, in merge order.
- **Deferred** — each with its reason (conflict state, structural-collision held, amendment
  requested, operator choice).
- **Decisions recorded** — PR + one-line resolution, per comment posted in per-merge step 2.
- **Index** — refreshed / unchanged.
- **Next steps** — anything the operator flagged, including findings that survived the
  session unresolved.

An empty queue is a valid outcome: report "queue empty — nothing to integrate" and stop.
