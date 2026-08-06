// sg-registry.ts — the CLOSED member registry for the additive `<sg-*>` tag family (IU-5, DR3/DR5).
//
// The `<sg-*>` family is CLOSED (only the members listed here exist), ADDITIVE (a new member is a new
// distinct tag NAME + its own registry row — never an overload of an existing member), and read by a
// SEPARATE global scan (scan-sg-tags.ts) that gates each tag BY SHAPE against the row's `valid`
// predicate and HONESTLY UNDER-CAPTURES — a non-registered tag name or a malformed body is simply
// DROPPED, never invented.
//
// This module registers the FIVE MODEL-EMITTED members (an agent writes them as paired tags in
// assistant text, scanned across ALL its output turns). The one SCRIPT-EMITTED member (`sg-gate`) is
// provenance-bound and captured by the gate scanner (IU-6), NOT here. `sg-signal` is RETIRED from the
// family (DR3); the experience-contract / trend-metric verdict channel is parse-signal.ts's — a
// separate path, left unchanged.
//
// Doctrine source (do NOT re-author here): graph-vUnified/_refs/sg-tag-registry.md — its fenced JSON
// member block is the sole conformance surface; this module is one of its executable twins (the shape
// gate). The schema projector + the publisher's independent re-enforcement are the others; the
// conformance suite set-compares all four.
//
// This registry is shipped FROM THE FACTORY (it is part of the analyzer, not the consuming workspace).
// The scan it backs is METRICS-ONLY: it NEVER enacts a durable store write. A tag is surfaced as a
// PROPOSAL to the attended invoke-gate; an unattended/dispatched-context tag is proposal-only.
//
// PORTABILITY: pure types + small pure functions. The closed routing enums, the restricted token
// grammar, and the DR4 sanitiser are single-sourced from schema.ts (the capture-boundary contract), so
// the shape gate here and the projector there can never disagree on a routing bound.

import {
  SG_DECISION_KINDS, SG_OPEN_ITEM_KINDS, SG_FRICTION_KINDS, SG_CONFLICT_KINDS,
  SG_SEVERITIES, SG_FRICTION_TARGETS, SG_STATUSES, SG_TOKEN_RE,
} from "./schema.ts";

/** IU-7 (DR11) — operator-action identity is DERIVE-STAMPED at COLLECTION level, not self-reported.
 *  An opener emits a bare LOCAL SLUG (`{id: <slug>, status: open}`); the analyzer canonicalises it to
 *  the 2-segment `<session-prefix>:<slug>` from the transcript's own session (an emitter never
 *  self-reports a session segment it cannot know); a closer copies the canonical id it read off the
 *  surfaced open-actions list. Each segment is length-capped so a hostile body can never smuggle
 *  free-text through the id.
 *
 *  `OPERATOR_ACTION_ID_RE` is the 2-segment CANONICAL shape — it is re-cut IN LOCKSTEP with the
 *  publisher's independent twin (`publish-projection.ts`) and equality-tested per the DR5 conformance
 *  suite. `OPERATOR_ACTION_SLUG_RE` is the opener's single bare segment; `OPERATOR_ACTION_LEGACY_ID_RE`
 *  is the retired 3-segment June id `<harness>:<session>:<n>`, accepted by IGNORING segment 1
 *  (deterministic mapping, no tombstoning; un-canonicalisable ids drop into DR12's aggregate count). */
const ID_SEGMENT = "[A-Za-z0-9][A-Za-z0-9._-]{0,63}";
export const OPERATOR_ACTION_ID_RE = new RegExp(`^${ID_SEGMENT}:${ID_SEGMENT}$`);
export const OPERATOR_ACTION_SLUG_RE = new RegExp(`^${ID_SEGMENT}$`);
export const OPERATOR_ACTION_LEGACY_ID_RE = new RegExp(`^${ID_SEGMENT}:${ID_SEGMENT}:${ID_SEGMENT}$`);

/** True when `id` is an EMITTED operator-action id shape the registry gate accepts — the opener's bare
 *  slug, the 2-segment canonical (a closer copying the surfaced id), or a legacy 3-segment June id.
 *  Canonicalisation (to the 2-segment shape) happens downstream in `canonicalizeOperatorActionId`. */
export function isAcceptedOperatorActionId(id: string): boolean {
  return OPERATOR_ACTION_SLUG_RE.test(id) || OPERATOR_ACTION_ID_RE.test(id) || OPERATOR_ACTION_LEGACY_ID_RE.test(id);
}

/** DR11 — canonicalise an EMITTED operator-action id, given the CAPTURING session, into the 2-segment
 *  canonical `<session-prefix>:<slug>`, or `null` when it cannot be canonicalised (the caller counts the
 *  drop into DR12's per-class aggregate — never a per-event WARN):
 *    • a bare SLUG          → `<session>:<slug>` (the session stamps the prefix the emitter cannot know);
 *    • a 2-segment id       → itself (already canonical: a closer copied it off the open-actions list);
 *    • a legacy 3-segment id→ `<seg2>:<seg3>` (IGNORE segment 1 — the retired harness prefix).
 *  Idempotent on a 2-segment id, so the bridge (write) and the publisher (read) never double-transform. */
export function canonicalizeOperatorActionId(emittedId: string, session: string): string | null {
  const segs = emittedId.split(":");
  if (segs.length === 1) {
    if (!OPERATOR_ACTION_SLUG_RE.test(emittedId) || !OPERATOR_ACTION_SLUG_RE.test(session)) return null;
    const canonical = `${session}:${emittedId}`;
    return OPERATOR_ACTION_ID_RE.test(canonical) ? canonical : null;
  }
  if (segs.length === 2) return OPERATOR_ACTION_ID_RE.test(emittedId) ? emittedId : null;
  if (segs.length === 3) {
    const canonical = `${segs[1]}:${segs[2]}`;
    return OPERATOR_ACTION_ID_RE.test(canonical) ? canonical : null;
  }
  return null; // 4+ segments — not a recognised operator-action id shape
}

/** One closed member of the `<sg-*>` family. */
export interface SgMember {
  /** The exact tag name (without angle brackets), e.g. "sg-friction". The scan keys on this verbatim. */
  tag: string;
  /** The closed body field set — the conformance twin of the registry ref's `fields` array. */
  fields: readonly string[];
  /** A SHAPE predicate over the already-JSON-parsed body. True only when every required field is present
   *  with a routing value in its closed enum / restricted token, and the free-text fields (`description`
   *  / `paths`) are the right BASE type — their VALUES are DR4-sanitised later, at the projector, never
   *  here. A body that fails this is DROPPED (a registry-shape gate drop). */
  valid: (body: unknown) => boolean;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function isEnum(v: unknown, set: ReadonlySet<string>): boolean {
  return typeof v === "string" && set.has(v);
}
function isToken(v: unknown): boolean {
  return typeof v === "string" && SG_TOKEN_RE.test(v);
}

/**
 * The CLOSED `<sg-*>` MODEL family — the five members the floor (sg-root-instructions §`<sg-*>` process
 * tags) lists and the registry reference fixes the capture contract for. Adding a member is adding a row
 * HERE (a distinct `tag` + its `fields` + its `valid` shape gate) AND the matching schema/publisher twin
 * edit — the conformance suite fails on any surface left behind. The `fields` mirror the registry block's
 * `emitter-class:model` members exactly:
 *   - `sg-decision`        — a load-bearing decision settled (also recorded durably via log-decision).
 *   - `sg-open-item`       — an out-of-scope deferral needing closure (paired open/close on an id).
 *   - `sg-friction`        — the doing impeded (missing/failed tool, denial, operator correction).
 *   - `sg-conflict`        — the context contradicts / confuses.
 *   - `sg-operator-action` — an operator-only obligation (paired open/close; rides its own row).
 */
export const SG_FAMILY: readonly SgMember[] = [
  {
    tag: "sg-decision",
    fields: ["kind", "subject"],
    valid: (b) => isPlainObject(b) && isEnum(b.kind, SG_DECISION_KINDS) && isToken(b.subject),
  },
  {
    tag: "sg-open-item",
    fields: ["id", "status", "kind"],
    valid: (b) => isPlainObject(b) && isToken(b.id) && isEnum(b.status, SG_STATUSES) && isEnum(b.kind, SG_OPEN_ITEM_KINDS),
  },
  {
    tag: "sg-friction",
    fields: ["kind", "severity", "description", "target"],
    valid: (b) => isPlainObject(b) && isEnum(b.kind, SG_FRICTION_KINDS) && isEnum(b.severity, SG_SEVERITIES)
      && typeof b.description === "string" && isEnum(b.target, SG_FRICTION_TARGETS),
  },
  {
    tag: "sg-conflict",
    fields: ["kind", "description", "paths"],
    valid: (b) => isPlainObject(b) && isEnum(b.kind, SG_CONFLICT_KINDS)
      && typeof b.description === "string" && Array.isArray(b.paths),
  },
  {
    tag: "sg-operator-action",
    fields: ["id", "status"],
    valid: (b) => isPlainObject(b) && typeof b.id === "string" && isAcceptedOperatorActionId(b.id)
      && isEnum(b.status, SG_STATUSES),
  },
];

/** The closed set of registered MODEL member tag names — the membership gate for the global scan. A
 *  `<sg-*>` tag whose name is not in here is NOT a family member and is dropped (never recorded). */
export const SG_MEMBER_TAGS: ReadonlySet<string> = new Set(SG_FAMILY.map((m) => m.tag));

/** The member → closed field-set map (the conformance twin of the registry block's `fields`). */
export const SG_MEMBER_FIELDS: Readonly<Record<string, readonly string[]>> =
  Object.fromEntries(SG_FAMILY.map((m) => [m.tag, m.fields]));

/** Look up a member by its tag name (without angle brackets), or undefined when the name is not a
 *  registered family member. */
export function memberFor(tag: string): SgMember | undefined {
  return SG_FAMILY.find((m) => m.tag === tag);
}

/** True when `tag` names a registered `<sg-*>` family member AND `body` passes that member's shape
 *  gate. A non-registered name OR a malformed body → false (the registry-shape drop). */
export function isRegisteredAndValid(tag: string, body: unknown): boolean {
  const member = memberFor(tag);
  if (!member) return false;
  return member.valid(body);
}
