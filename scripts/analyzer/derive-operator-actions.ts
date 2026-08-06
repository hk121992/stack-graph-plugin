// derive-operator-actions.ts — the `<sg-operator-action>` lifecycle derivation (IU-A6).
//
// WHAT THIS IS. A NEW central-merge-tier derivation: a GROUP-BY-`id` per-group state reducer over the
// merged, sanitised `<sg-operator-action>` events. It correlates an operator-action obligation's OPEN
// with its CLOSE across transcripts and reduces each id-group to one outstanding/latency view. It is
// DELIBERATELY NOT a delta over A3: `derive-activity.ts` is a WITHIN-transcript skill-adjacency
// coalescer with no correlation id, and `derive-stalls.ts` is a CROSS-transcript WALL-CLOCK gap (which
// A3 rejected and A6 may not reuse). A6 is a cross-transcript JOIN keyed on the explicit `id` — only
// the per-id span OUTPUT shape is shared with A3. The cross-HARNESS join is owned by the central merge
// (merge.ts): an open in harness A and a close in harness E pair only once both logs merge.
//
// ── THE FAIL-SAFE AUTHORITY RULE (security P0 — the load-bearing property) ────────────────────────
// A6 is the FIRST `<sg-*>` member whose effect crosses transcripts: one transcript's `close id=K`
// would mutate an operator-facing view about an obligation opened ELSEWHERE. So the family's
// "metrics-only when unattended" discipline does not transfer unaided — an ungated close→suppress path
// is a forgeable suppression hole. The rule (IU-7/DR11 re-cut to COLLECTION-level identity, resolving
// SG-2's "close-authority unsatisfiable"; mirroring Track B's `record-gate` authority):
//
//   • A needs-you is HIDDEN (state `closed`) ONLY by an AUTHORITATIVE close — attended/operator-
//     attested AND SAME-COLLECTION (the close's collection equals the anchoring open's collection).
//     Such a close is the genuine resolution.
//   • An UNATTENDED, or CROSS-COLLECTION, close can only derive the obligation to `close-proposed`
//     (STILL VISIBLE, marked "someone proposed closing this") — NEVER to closed-and-hidden. So a
//     forged / colliding / cross-collection close can only ADD a marker, never SUBTRACT a real needs-you.
//
// COLLECTION-LEVEL, NOT PER-EVENT (DR11). The obligation id is the 2-segment `<session-prefix>:<slug>`
// (no harness segment); the collection is a COLLECTION-tier property (the bindings' collection key),
// applied to the events of a run as a whole — NOT the retired per-event `harness_id` parsed from each
// transcript's META. Within one collection's log every event shares one collection, so an attended
// close is authoritative; two DIFFERENT collections' events pair only at the central merge, where a
// cross-collection close can only propose.
//
// Symmetrically, only ATTENDED opens populate the needs-you list; an UNATTENDED open counts toward
// friction-metrics ONLY (an aggregate, never an item-by-item surface), so forged-open spam cannot bury
// a real needs-you (security P1).
//
// ── HONEST UNDER PARTIAL CAPTURE ──────────────────────────────────────────────────────────────────
// Under A2's partial merge an unmatched open may be LEGITIMATELY outstanding OR closed in a not-yet-
// merged log. We gate the confident `outstanding` on a MERGE-COMPLETENESS signal (all expected
// producers reported, mirroring A5). With complete capture an unmatched (attended) open is
// `outstanding`; under INCOMPLETE capture it is `possibly-outstanding` (capture incomplete) — not a
// confident nag — and it flips to `closed` (no phantom nag) the moment the missing close's log merges.
//
// ── DEGENERATE-PAIR SEMANTICS (the §A6 table) — and ONLY clean 1:1 pairs feed the latency aggregate ─
//   1 open · 1 close          → closed                | latency = close−open (COUNTED) | ok
//   1 open · 0 close          → outstanding (or possibly-outstanding under partial capture) | excluded | ok
//   0 open · 1 close          → dropped (no anchor)   | excluded | orphan-close note
//   N opens · 1 close         → closed (EARLIEST open anchors) | excluded | dup-open note
//   1 open · N closes         → closed at FIRST close (later ignored) | excluded | dup-close note
//
// PORTABILITY: pure types + small pure functions — no fs/Bun globals.

import { ANALYZER_EVENT_V } from "./schema.ts";
import type { OperatorActionState, OperatorActionRow } from "./schema.ts";
import type { SgProposal } from "./scan-sg-tags.ts";
// DR11 — the collection-level id grammar lives in sg-registry.ts (the shape gate + its equality-tested
// publisher twin); the bridge reuses its canonicaliser so the WRITTEN id is the 2-segment canonical.
import { canonicalizeOperatorActionId } from "./sg-registry.ts";

// The lifecycle-state enum + the publishable row shape are owned by schema.ts (the shared shape home);
// re-exported here so consumers of the deriver get them without a second import.
export type { OperatorActionState, OperatorActionRow } from "./schema.ts";

/** One `<sg-operator-action>` member event, AFTER the registry shape-gate (sg-registry.ts guarantees
 *  `id` is the 3-segment grammar and `status` is exactly open|closed). Enriched with the two authority
 *  signals the reducer needs: whether the EMITTING context was attended, and the ACTOR harness that
 *  emitted it (the row's attribution harness_id). These are what distinguish an authoritative close
 *  from a forgeable one. */
export interface OperatorActionEvent {
  /** The 2-segment CANONICAL obligation id `<session-prefix>:<slug>` (IU-7/DR11), canonicalised by the
   *  bridge from the emitted slug + the transcript session (or a legacy 3-segment id). Pairing is by
   *  this full canonical id — never a bare slug — so a reused slug in a different session is a
   *  DIFFERENT obligation. */
  id: string;
  /** open | close (derived from the body's `status`). */
  kind: "open" | "close";
  /** True when the emitting transcript was ATTENDED (top-level) — the scan's `surfaced` disposition.
   *  False for a DISPATCHED (subagent / unattended) context — the scan's `proposal-only`. Only an
   *  attended open populates needs-you; only an attended (and same-collection) close can hide. */
  attended: boolean;
  /** The COLLECTION this event belongs to (IU-7/DR11) — a collection-tier property (the bindings'
   *  collection key), NOT the retired per-event `harness_id`. A close hides only when its collection
   *  equals the anchoring open's (same-collection). `null` is the single-collection / unkeyed run: all
   *  of a run's events share it, so an attended close is authoritative; two DIFFERENT non-null
   *  collections (paired only at the central merge) are cross-collection ⇒ the close can only propose. */
  collection: string | null;
  /** The event's strict-UTC ISO timestamp — used only to order opens/closes within a group and to
   *  compute the clean-1:1 latency. */
  ts: string;
}

/** The reduced view of ONE operator-action obligation (one `id`-group). */
export interface OperatorAction {
  /** The 2-segment canonical obligation id `<session-prefix>:<slug>` (IU-7/DR11). */
  id: string;
  state: OperatorActionState;
  /** True iff this obligation is currently a needs-you item the operator must act on — exactly the
   *  states `outstanding` and `possibly-outstanding` AND an attended open exists. A `close-proposed`
   *  item is ALSO surfaced (visible-but-unresolved) but is flagged separately so the operator sees the
   *  proposed close; see `close_proposed`. */
  outstanding: boolean;
  /** True when a non-authoritative close was seen for this obligation — the "someone proposed closing
   *  this" marker. The obligation REMAINS visible; this only ADDS the marker (never hides). */
  close_proposed: boolean;
  /** The clean-1:1 latency in ms (close−open), present ONLY for a clean 1 open · 1 authoritative-close
   *  pair. Undefined for every degenerate group — only clean pairs feed the latency aggregate. */
  latency_ms?: number;
  /** A bounded health note for a degenerate group (orphan-close / dup-open / dup-close), else null. */
  health: "ok" | "orphan-close" | "dup-open" | "dup-close";
}

/** The merge-completeness signal (mirrors A5's honest-under-capture). When `complete` is false, an
 *  unmatched open degrades to `possibly-outstanding` rather than a confident `outstanding`. */
export interface CaptureCompleteness {
  /** True only when ALL expected producer logs have reported — the confident-outstanding gate. */
  complete: boolean;
}

/** Whether a CLOSE event is AUTHORITATIVE for an obligation anchored by `anchorOpen` (IU-7/DR11):
 *  attended/attested AND same-COLLECTION (the close's collection equals the anchoring open's). A close
 *  from a DIFFERENT collection can only propose, never hide (the load-bearing cross-collection guard);
 *  two events of ONE run share a collection (incl. the `null` single-collection run), so an attended
 *  close there is the genuine resolution. */
function isAuthoritativeClose(ev: OperatorActionEvent, anchorOpen: OperatorActionEvent): boolean {
  if (!ev.attended) return false; // unattended close → at most close-proposed
  return ev.collection === anchorOpen.collection; // same-collection attended close is the genuine resolution
}

/**
 * Reduce ONE id-group (all events sharing one obligation `id`) to its settled OperatorAction.
 *
 * ORDER-INDEPENDENT: the events are sorted by (ts, kind) inside, so the reduction is identical
 * regardless of the order they arrived in the merged set (the load-bearing order-independence). The
 * earliest open anchors; the first AUTHORITATIVE close (in time) resolves; later opens/closes are
 * absorbed into the dup-* health note, never re-counted.
 */
function reduceGroup(id: string, events: OperatorActionEvent[], capture: CaptureCompleteness): OperatorAction {
  // Sort by (ts, then opens-before-closes) so the EARLIEST open anchors and the FIRST close resolves —
  // deterministically, independent of input order. The (ts, kind) total order makes a same-instant
  // open sort before a same-instant close (an open cannot follow its own close at the same instant).
  const ordered = [...events].sort((a, b) => {
    if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1;
    if (a.kind !== b.kind) return a.kind === "open" ? -1 : 1; // open before close at equal ts
    return 0;
  });

  const opens = ordered.filter((e) => e.kind === "open");
  const closes = ordered.filter((e) => e.kind === "close");

  // ── 0 open · ≥1 close → DROPPED (orphan; no anchor). Never a needs-you. (Table row 0·1 / orphan.) ──
  if (opens.length === 0) {
    return {
      id,
      state: "dropped", outstanding: false, close_proposed: false,
      health: "orphan-close",
    };
  }

  // The EARLIEST open anchors (table rows N·1 / 1·1 / 1·0) — and its COLLECTION is the authority scope a
  // close must match (IU-7/DR11). Only ATTENDED opens populate needs-you: an obligation whose only opens
  // are unattended is friction-metrics-only (security P1) — never an item-by-item needs-you. We still
  // reduce its close lifecycle (so a stray close is handled), but it can never become
  // `outstanding`/`possibly-outstanding` (no attended anchor).
  const anchorOpen = opens[0]; // earliest open anchors — its collection is the owning scope
  const hasAttendedOpen = opens.some((e) => e.attended);

  // The FIRST AUTHORITATIVE close (in time) resolves the obligation (table rows 1·1, 1·N first-close).
  // A non-authoritative close (unattended OR cross-collection) NEVER hides — it only raises the
  // close-proposed marker (security P0: a forged/cross-collection close can only ADD a marker).
  const authoritativeCloses = closes.filter((e) => isAuthoritativeClose(e, anchorOpen));
  const firstAuthoritativeClose = authoritativeCloses[0] ?? null;
  const hasNonAuthoritativeClose = closes.some((e) => !isAuthoritativeClose(e, anchorOpen));

  // Health: dup-open (N opens), dup-close (N closes); ok otherwise. Orphan handled above.
  let health: OperatorAction["health"] = "ok";
  if (opens.length > 1) health = "dup-open";
  else if (closes.length > 1) health = "dup-close";

  // ── CLOSED: an authoritative close exists ⇒ the obligation is genuinely resolved (hidden). ────────
  if (firstAuthoritativeClose) {
    // Latency is COUNTED only for a CLEAN 1 open · 1 close pair — exactly one open, exactly one close,
    // and that one close is the authoritative one. Every degenerate group is EXCLUDED from latency.
    const clean11 = opens.length === 1 && closes.length === 1;
    const latency_ms = clean11
      ? Math.max(0, new Date(firstAuthoritativeClose.ts).getTime() - new Date(anchorOpen.ts).getTime())
      : undefined;
    return {
      id,
      state: "closed",
      outstanding: false,
      // Even a genuinely-closed obligation records that a non-authoritative close was ALSO seen, for
      // completeness — but `closed` already hides it, so this is informational, not a visibility flip.
      close_proposed: hasNonAuthoritativeClose,
      ...(latency_ms !== undefined ? { latency_ms } : {}),
      health,
    };
  }

  // ── No authoritative close. If a NON-authoritative close was seen ⇒ close-proposed (STILL VISIBLE). ─
  if (hasNonAuthoritativeClose) {
    return {
      id,
      state: "close-proposed",
      // It REMAINS a needs-you the operator must resolve — the proposed close did NOT hide it. Only an
      // obligation with an attended open is an item-by-item needs-you (P1); an unattended-only open is
      // friction-metrics, so it is not surfaced as an item even though it carries the proposed marker.
      outstanding: hasAttendedOpen,
      close_proposed: true,
      health,
    };
  }

  // ── No close at all: outstanding (complete capture) or possibly-outstanding (incomplete). ─────────
  // Only an attended open is an item-by-item needs-you (P1). An unattended-only open is
  // friction-metrics-only — reduced, but never surfaced (outstanding=false, state still reflects the
  // honest capture level so the metrics path can read it).
  const state: OperatorActionState = capture.complete ? "outstanding" : "possibly-outstanding";
  return {
    id,
    state,
    outstanding: hasAttendedOpen,
    close_proposed: false,
    health,
  };
}

/**
 * GROUP BY `id`, then reduce each group — the central-merge-tier derivation. Pure + ORDER-INDEPENDENT:
 * the same event set in ANY order produces the same OperatorAction[] (each group is internally sorted,
 * and the output is sorted by id). This is the cross-transcript JOIN A6 is — NOT a within-transcript
 * adjacency (A3).
 *
 * STALE-`id`-REUSE: because the canonical id carries the session prefix (`<session-prefix>:<slug>`,
 * IU-7/DR11), a reused slug OPENED in a different session has a DIFFERENT canonical id and lands in a
 * DIFFERENT group — a later open can never pair with an earlier close of a (textually) reused slug.
 * Pairing is by the full canonical id, never a bare slug.
 *
 * COLLECTION-WIRING CONTRACT (forward). In the SINGLE-collection run (the shipped publisher path) every
 * event's `collection` is one value (null), so same-collection is automatic and an attended close is
 * authoritative — correct, because one log IS one collection. The cross-collection guard (a close in a
 * different collection can only propose) is a CENTRAL-MERGE concern: a future caller that unions logs
 * from DIFFERENT collections MUST first stamp each source's events with that collection's key (the
 * bindings' collection identity — a COLLECTION-tier property, NOT a per-event `harness_id`) BEFORE
 * feeding them here. Skipping that leaves both sides `null` ⇒ `null === null` same-collection ⇒ the P0
 * cross-collection guard collapses. The mechanism is proven by the authority-matrix unit tests today.
 */
export function deriveOperatorActions(
  events: readonly OperatorActionEvent[],
  capture: CaptureCompleteness = { complete: true },
): OperatorAction[] {
  const groups = new Map<string, OperatorActionEvent[]>();
  for (const ev of events) {
    const g = groups.get(ev.id);
    if (g) g.push(ev);
    else groups.set(ev.id, [ev]);
  }
  const out: OperatorAction[] = [];
  for (const [id, group] of groups) out.push(reduceGroup(id, group, capture));
  // Sort by id for a stable, order-independent output (the group reduction is already order-independent
  // internally; sorting the groups makes the whole result deterministic regardless of input order).
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

/** The NEEDS-YOU surface: exactly the obligations the operator must act on — `outstanding` true (an
 *  attended open with no authoritative close). A `close-proposed` obligation with an attended open is
 *  INCLUDED (it is still unresolved — the proposed close only added a marker, the load-bearing P0
 *  property). A `dropped` orphan and an unattended-only open are EXCLUDED (never an item-by-item nag). */
export function needsYouList(actions: readonly OperatorAction[]): OperatorAction[] {
  return actions.filter((a) => a.outstanding);
}

/** The latency aggregate: the close−open latencies of ONLY clean 1:1 pairs (every degenerate group is
 *  excluded). Returns the per-obligation latencies and their mean (null when no clean pair exists). */
export function latencyAggregate(actions: readonly OperatorAction[]): { latencies_ms: number[]; mean_ms: number | null } {
  const latencies_ms = actions
    .filter((a) => typeof a.latency_ms === "number")
    .map((a) => a.latency_ms as number);
  const mean_ms = latencies_ms.length > 0
    ? latencies_ms.reduce((s, x) => s + x, 0) / latencies_ms.length
    : null;
  return { latencies_ms, mean_ms };
}

/**
 * Bridge ONE `<sg-operator-action>` proposal (from scan-sg-tags.ts — already registry-shape-gated, so
 * its body is `{ id: <slug|2-seg|legacy-3-seg>, status: open|closed }`) into an `OperatorActionEvent`.
 * DR11: the emitted id is CANONICALISED to `<session-prefix>:<slug>` using the CAPTURING session (the
 * emitter cannot self-report a session segment) — a bare slug is stamped, a legacy 3-segment id maps by
 * ignoring segment 1. The authority signals:
 *   • `attended` ← the proposal's `surfaced` disposition (attended top-level) vs `proposal-only`
 *     (dispatched/unattended). This is the SAME attended/dispatched signal the scan already discriminates.
 *   • `collection` ← the COLLECTION this run belongs to (the bindings' collection key; `null` for the
 *     single-collection / unkeyed run), supplied by the caller at COLLECTION tier — NOT the retired
 *     per-event `harness_id`. It decides cross-collection close-authority at the deriver.
 * Returns null when the proposal is not an `sg-operator-action` member, its body is not the expected
 * shape, OR the id cannot be canonicalised (an un-canonicalisable id is dropped — the caller counts it).
 */
export function eventFromProposal(
  proposal: SgProposal,
  session: string,
  ts: string,
  collection: string | null = null,
): OperatorActionEvent | null {
  if (proposal.tag !== "sg-operator-action") return null;
  const body = proposal.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const id = (body as { id?: unknown }).id;
  const status = (body as { status?: unknown }).status;
  if (typeof id !== "string") return null;
  if (status !== "open" && status !== "closed") return null;
  const canonicalId = canonicalizeOperatorActionId(id, session);
  if (canonicalId === null) return null; // un-canonicalisable id → drop (the caller aggregates the count)
  return {
    id: canonicalId,
    kind: status === "open" ? "open" : "close",
    attended: proposal.disposition === "surfaced",
    collection,
    ts,
  };
}

/** Project a reduced `OperatorAction` (in-memory view) into a serializable `OperatorActionRow` (the
 *  publishable shape — adds `kind` + the schema version). The needs-you/latency surface in the
 *  publisher reads these rows. */
export function toOperatorActionRow(a: OperatorAction): OperatorActionRow {
  return {
    kind: "operator-action",
    id: a.id,
    state: a.state,
    outstanding: a.outstanding,
    close_proposed: a.close_proposed,
    ...(typeof a.latency_ms === "number" ? { latency_ms: a.latency_ms } : {}),
    health: a.health,
    v: ANALYZER_EVENT_V,
  };
}
