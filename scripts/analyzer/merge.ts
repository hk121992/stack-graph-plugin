// merge.ts — the CENTRAL merge of the already-derived, already-sanitised per-harness logs
// (Cluster A §9 locality; IU-A2b of wi-analytics-lifecycle-review).
//
// LOCALITY (the load-bearing invariant). Each harness derives its OWN event log LOCALLY — the
// analyzer runs only where the transcripts live, and the derived log (`.stack-graph/derived/…`) never
// leaves that machine in raw form. The analyzer's home is honoured: derivation is per-harness-local.
// What CAN combine is the already-derived, already-sanitised per-harness rows — and that is THIS
// module's only job. `mergeHarnessLogs` does NOT read transcripts, re-derive, or sanitise; it takes
// the sanitised rows each harness already produced and combines them into one canonical stream.
//
// THE TWO LOAD-BEARING PROPERTIES.
//   • NO LOSS — every DISTINCT logical row across all inputs survives the merge.
//   • NO DOUBLE-COUNT — the SAME logical row, presented more than once (the same harness's log handed
//     in twice, or a row that legitimately appears identically in two inputs), collapses to exactly
//     one. Counting it twice would inflate every downstream aggregate (the reconciliation inequality,
//     the cost series) — so the merge dedups.
//
// THE DEDUP KEY — the row's full canonical identity, which INCLUDES `harness_id`. A derived row IS its
// content: the analyzer full-rewrites one settled row per (session, scope, kind), so two rows are the
// SAME logical event iff they are byte-identical once canonically serialised. We key on the canonical
// JSON of the row (`rowKey`), so:
//   • identical rows (a log merged twice) ⇒ identical key ⇒ one survives (no double-count);
//   • any byte difference ⇒ distinct key ⇒ both survive (no loss).
// `harness_id` PARTICIPATES structurally: it is part of every row's JSON, so two SAME-NAMED carriers
// under DIFFERENT `harness_id` serialise differently and therefore NEVER collapse — the fleet-wide
// non-collision property A2a's key delivers, enforced here at the merge. A `null` (uncaptured)
// harness_id is its own honest sentinel: it can only ever collapse with ANOTHER null-harness row that
// is otherwise byte-identical (the same local event), never with a real harness's row.
//
// ORDER-INDEPENDENT + BYTE-STABLE. The result is the deduped set re-sorted by the schema's canonical
// total order (compareRows). Dedup-by-key ∪ canonical-sort is commutative and idempotent, so
// merge(A, B) and merge(B, A) — and merge(A, A, B) — produce the BYTE-IDENTICAL serialisation. The
// merged output is canonical regardless of the order the per-harness logs arrive in.
//
// PORTABILITY: pure data — no fs/Bun globals. Reuses the schema's canonical compare/serialise so the
// merge's at-rest output is byte-for-byte what a single-harness analyze.ts would write for the union.

import { compareRows, serializeRows } from "./schema.ts";
import type { DerivedRow } from "./schema.ts";
import type { OperatorActionEvent } from "./derive-operator-actions.ts";
import { canonicalize } from "../lib/canonical-json.ts";

/** One sanitised per-harness log = the canonical rows that harness's analyzer already derived. */
export type HarnessLog = DerivedRow[];

/**
 * The canonical dedup identity of a derived row: its full content, key-order-canonicalised so that
 * two rows that differ ONLY in JS key insertion order still hash to one key. `harness_id` is part of
 * this identity (it is a field of every attribution-bearing row), so the key carries the fleet-wide
 * non-collision distinction by construction.
 *
 * Why re-key the JSON rather than `JSON.stringify(row)` directly: a producer could build an otherwise
 * identical row with its object keys in a different insertion order; that must NOT count as a distinct
 * logical row (it would be a phantom no-loss "win" that is really a double-count waiting to happen).
 * Sorting keys recursively makes the identity depend on VALUES, not authoring order.
 */
export function rowKey(row: DerivedRow): string {
  return JSON.stringify(canonicalize(row));
}

/**
 * Merge any number of sanitised per-harness logs into ONE canonical, deduped row set.
 *
 * No loss: every distinct row (by `rowKey`) across all inputs is present in the result.
 * No double-count: a row that appears identically in more than one input (or twice in one input)
 * is present exactly once.
 * Order-independent + byte-stable: the result is independent of the order the logs (and the rows
 * within them) are supplied — `mergeHarnessLogs(a, b)` deep-equals `mergeHarnessLogs(b, a)`, and
 * `serializeMergedLogs` over either is byte-for-byte identical.
 *
 * Returns the deduped rows in the schema's canonical total order (compareRows), so the array itself
 * is already byte-stable; callers that want the JSONL body use `serializeMergedLogs`.
 */
export function mergeHarnessLogs(...logs: HarnessLog[]): DerivedRow[] {
  const byKey = new Map<string, DerivedRow>();
  for (const log of logs) {
    for (const row of log) {
      const key = rowKey(row);
      // First write wins; an identical row seen again is the same logical event — DROP it (no
      // double-count). Because the key is the full canonical identity, "identical" means truly the
      // same row, never a same-named-carrier collision across harnesses (those differ in harness_id).
      if (!byKey.has(key)) byKey.set(key, row);
    }
  }
  return [...byKey.values()].sort(compareRows);
}

/**
 * The merged log as a canonical JSONL body (the same serialisation a single analyze.ts run would
 * write). BYTE-STABLE and ORDER-INDEPENDENT: identical bytes regardless of input order, because the
 * rows are deduped by canonical identity and re-sorted by compareRows before serialisation.
 */
export function serializeMergedLogs(...logs: HarnessLog[]): string {
  return serializeRows(mergeHarnessLogs(...logs));
}

// ── IU-A6 — THE CROSS-HARNESS JOIN for `<sg-operator-action>` events ──────────────────────────────
//
// The central merge OWNS the cross-harness join: an obligation OPENED in harness A and CLOSED in
// harness E can only pair ONCE BOTH harnesses' logs merge here. This function unions the per-harness
// sanitised `OperatorActionEvent` lists into ONE set — exactly so the GROUP-BY-`id` derivation
// (derive-operator-actions.ts) can pair an open and close that originated in DIFFERENT harnesses. It
// is the SAME no-loss / no-double-count discipline as `mergeHarnessLogs`, applied to operator-action
// events; it is ADDITIVE — the derived-row merge above is untouched (A2b's merge preserved).
//
// NO LOSS / NO DOUBLE-COUNT: keyed on the canonical identity of the event (id + kind + attended +
// collection + ts, key-order-canonicalised — IU-7/DR11 replaced the retired `actor_harness_id` with the
// collection-tier `collection`). The SAME event presented twice (a log handed in twice) collapses to
// one; any byte difference (a different collection, a different ts) survives. Order-independent +
// byte-stable: the union ∪ a canonical sort is commutative + idempotent.

/** The canonical dedup identity of an operator-action event — value-determined (recursive key-sort),
 *  so two events differing only in JS key order are the SAME event (no phantom no-loss win). */
export function operatorActionEventKey(ev: OperatorActionEvent): string {
  return JSON.stringify(canonicalize(ev));
}

/** A canonical total order for operator-action events so the merged set is byte-stable regardless of
 *  input order (mirrors compareRows for derived rows). Orders by (id, ts, kind, then full identity). */
function compareOperatorActionEvents(a: OperatorActionEvent, b: OperatorActionEvent): number {
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1;
  if (a.kind !== b.kind) return a.kind === "open" ? -1 : 1;
  const ka = operatorActionEventKey(a);
  const kb = operatorActionEventKey(b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

/**
 * Merge any number of per-harness `<sg-operator-action>` event logs into ONE deduped, canonically-
 * ordered set — the cross-harness join. NO LOSS (every distinct event survives), NO DOUBLE-COUNT (an
 * identical event seen twice collapses to one), ORDER-INDEPENDENT + BYTE-STABLE (the result is
 * independent of input order). Feeding this union to `deriveOperatorActions` is how an open in one
 * harness pairs with a close in another — the central merge owning the cross-harness join.
 */
export function mergeOperatorActionEvents(...logs: OperatorActionEvent[][]): OperatorActionEvent[] {
  const byKey = new Map<string, OperatorActionEvent>();
  for (const log of logs) {
    for (const ev of log) {
      const key = operatorActionEventKey(ev);
      if (!byKey.has(key)) byKey.set(key, ev); // identical event seen again → drop (no double-count)
    }
  }
  return [...byKey.values()].sort(compareOperatorActionEvents);
}
