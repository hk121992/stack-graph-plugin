// derive-tokens.ts — token / cache / cost rows (Cluster A §3.1; replaces #21's hooks).
//
// Reuses lib/transcript-usage.ts (sumUsage) VERBATIM — the one preserved core from #21. This module
// adds NO token parsing of its own; it only shapes sumUsage's result into the publisher's
// unit-usage / session-usage / dispatch-usage row contract (§3.1 schema, 6-component token_usage,
// cumulative:false always, one settled row per scope).

import { sumUsage } from "../lib/transcript-usage.ts";
import type { UsageComponents } from "../lib/transcript-usage.ts";
import { ANALYZER_EVENT_V } from "./schema.ts";
import type { TranscriptMeta, UsageRow, AttributionTriple } from "./schema.ts";

/** The dominant model of a by_model breakdown = the model with the greatest total. Deterministic
 *  tie-break: lexicographically-smallest model id wins, so the row is byte-stable across runs. */
export function dominantModel(byModel: Record<string, UsageComponents>): string {
  let best: string | null = null;
  let bestTotal = -1;
  for (const model of Object.keys(byModel).sort()) {
    const t = byModel[model].total;
    if (t > bestTotal) {
      bestTotal = t;
      best = model;
    }
  }
  return best ?? "unknown";
}

/** Shape a sumUsage result + scope into the publisher's usage-row contract (§3.1). cumulative is
 *  ALWAYS false (the batch sees the settled transcript). The raw session id is carried (local-only,
 *  gitignored log); the publisher anonymises at projection — the analyzer is NOT the locality
 *  boundary for session ids (§9). */
function usageRow(
  kind: UsageRow["kind"],
  scopeId: string,
  meta: TranscriptMeta,
  attribution: AttributionTriple,
  usage: UsageComponents,
  model: string,
): UsageRow {
  return {
    ts: meta.firstTs ?? meta.lastTs ?? "",
    kind,
    scope_id: scopeId,
    session: meta.sessionId,
    carrier: attribution.carrier,
    carrier_kind: attribution.carrier_kind,
    arc: attribution.arc,
    model,
    cumulative: false,
    token_usage: {
      input: usage.input,
      output: usage.output,
      cache_creation_5m: usage.cache_creation_5m,
      cache_creation_1h: usage.cache_creation_1h,
      cache_read: usage.cache_read,
      total: usage.total,
    },
    v: ANALYZER_EVENT_V,
  };
}

/**
 * Derive the token rows for one transcript.
 *  - A TOP-LEVEL session transcript → one `session-usage` row (scope = anonymisable session).
 *  - A SUBAGENT (dispatched) transcript → a `dispatch-usage` row (carrier-scoped) AND, when the
 *    dispatch resolves an IU id, a `unit-usage` row (IU-scoped). Both sum the SAME subagent
 *    transcript (§3.1: unit/dispatch usage both come from the dispatched-session transcript).
 *
 * One settled row per scope: a transcript yields at most one row per kind, so the full-rewrite in
 * analyze.ts never duplicates a (session, scope) pair (§9 idempotency).
 */
export function deriveTokenRows(meta: TranscriptMeta, attribution: AttributionTriple): UsageRow[] {
  const r = sumUsage(meta.path);
  // No assistant usage in this transcript → no token rows (honest under-capture).
  if (r.counted_messages === 0) return [];

  const model = dominantModel(r.by_model);
  const usage: UsageComponents = {
    input: r.input,
    output: r.output,
    cache_creation_5m: r.cache_creation_5m,
    cache_creation_1h: r.cache_creation_1h,
    cache_read: r.cache_read,
    total: r.total,
  };

  const rows: UsageRow[] = [];

  if (meta.isSubagent) {
    // Dispatched-session transcript → carrier-scoped dispatch-usage + (when known) IU-scoped unit-usage.
    const dispatchScope = attribution.carrier ?? meta.sessionId;
    rows.push(usageRow("dispatch-usage", dispatchScope, meta, attribution, usage, model));
    if (attribution.iu) {
      rows.push(usageRow("unit-usage", attribution.iu, meta, attribution, usage, model));
    }
  } else {
    // Top-level session transcript → one session-usage row. Scope = raw session id; the publisher
    // anonymises it to sess-<n> at projection.
    rows.push(usageRow("session-usage", meta.sessionId, meta, attribution, usage, model));
  }

  return rows;
}
