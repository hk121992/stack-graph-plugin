// derive-stalls.ts — cross-session stall derivation (Cluster A §3.3).
//
// A stall is the CROSS-SESSION view a per-session hook structurally cannot produce: a gap BETWEEN
// consecutive activity timestamps (across all sessions, ordered by timestamp) that exceeds a
// threshold dial (default 30 min). For each such gap the analyzer pairs the last-activity-before with
// the first-activity-after and records the gap. Where the pre-gap activity is on a graph node (a
// best-effort, deterministic node tag from the activity span), the stall is tagged with that node —
// this is exactly the 14h overnight gate-stall #28 cited.
//
// LOCALITY (§9 S1): before_node / after_node are node ids (ID_RE-clean by construction — they come
// from the graph-node id set); session ids are the raw local ids (the publisher anonymises). No
// free-text crosses into a stall row.

import { ANALYZER_EVENT_V } from "./schema.ts";
import type { ActivityRow, StallRow } from "./schema.ts";

/** One ordered activity instant: a timestamp tied to the node + session that was active then. */
export interface ActivityInstant {
  tsMs: number;
  ts: string;
  node: string | null;
  session: string;
}

/** Flatten activity rows (enter/exit) into ordered instants. Each enter/exit contributes one instant
 *  carrying its node + session. Rows whose ts is not a valid instant are dropped. */
export function instantsFromActivity(rows: ActivityRow[]): ActivityInstant[] {
  const out: ActivityInstant[] = [];
  for (const r of rows) {
    const ms = Date.parse(r.ts);
    if (!Number.isFinite(ms)) continue;
    out.push({ tsMs: ms, ts: r.ts, node: r.node, session: r.session });
  }
  return out;
}

/**
 * Derive stall rows from the cross-session ordered activity instants. A gap between consecutive
 * instants greater than `thresholdMs` yields one stall-record. before/after node + session come from
 * the bracketing instants. Deterministic: instants are sorted by (tsMs, session, node) so the output
 * is byte-stable.
 *
 * `gateHoldingNodes` (optional) restricts the before_node TAG to gate-holding nodes per §3.3 ("tag
 * the stall with the pre-gap node when it is a gate-holding node"). When omitted, the pre-gap node is
 * always recorded as before_node (the best-effort tag); the gap itself is always recorded regardless.
 */
export function deriveStallRows(
  instants: ActivityInstant[],
  thresholdMs: number,
  gateHoldingNodes?: ReadonlySet<string>,
): StallRow[] {
  if (thresholdMs <= 0 || instants.length < 2) return [];
  const sorted = [...instants].sort((a, b) =>
    a.tsMs !== b.tsMs ? a.tsMs - b.tsMs
      : a.session !== b.session ? (a.session < b.session ? -1 : 1)
      : (a.node ?? "") < (b.node ?? "") ? -1 : (a.node ?? "") > (b.node ?? "") ? 1 : 0,
  );

  const rows: StallRow[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const before = sorted[i - 1];
    const after = sorted[i];
    const gap = after.tsMs - before.tsMs;
    if (gap <= thresholdMs) continue;

    // The before_node tag: the pre-gap node, restricted to gate-holding nodes when that set is given
    // (so a stall on a non-gate node carries no node tag — honest, never invented).
    let beforeNode = before.node;
    if (gateHoldingNodes && (beforeNode === null || !gateHoldingNodes.has(beforeNode))) {
      beforeNode = null;
    }

    rows.push({
      ts: before.ts, // the gap START (the last activity before the stall)
      kind: "stall-record",
      gap_ms: gap,
      before_node: beforeNode,
      after_node: after.node,
      session_before: before.session,
      session_after: after.session,
      v: ANALYZER_EVENT_V,
    });
  }
  return rows;
}
