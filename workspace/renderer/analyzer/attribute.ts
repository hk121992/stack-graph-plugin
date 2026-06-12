// attribute.ts — resolve the (carrier, carrier_kind, arc, iu) triple for a transcript (Cluster A §3.5).
//
// The in-context hook KNEW the carrier; a batch analyzer must DERIVE it, and the iron rule is:
// NEVER a wrong attribution — a mis-parse degrades to session-level then to null, never to a guessed
// carrier. The publisher's resolveTriple (closed CARRIER_KINDS / ARCS allowlists) is the final guard;
// the analyzer produces TO it.
//
// Primary signal (dispatched sessions): the dispatch prompt — the FIRST user message of a
// <session>/subagents/agent-*.jsonl transcript — carries a
//     META: carrier=<id> kind=<work-item|standalone-iu> arc=<dev-sprint|incremental> iu=<id>
// line (the form loop-runner emits after A3′). The analyzer reads it via a BOUNDED regex over the
// allowlisted kind/arc vocab and the ID grammar. Absent the META line (today's real prose bundles),
// it falls back to session-level signals (gitBranch iu/<id>, cwd), then null.

import { ID_RE, CARRIER_KINDS, ARCS, NULL_ATTRIBUTION } from "./schema.ts";
import type { TranscriptEntry, TranscriptMeta, AttributionTriple } from "./schema.ts";

// Bounded token grammars for the META fields — each is anchored to a single line of values and
// length-capped, so a hostile prompt cannot smuggle free-text through (locality §9 S1). The id
// grammar mirrors the publisher's ID_RE character class.
const ID_TOKEN = "[A-Za-z0-9][A-Za-z0-9._-]{0,63}";
const META_CARRIER_RE = new RegExp(`\\bcarrier=(${ID_TOKEN})`);
const META_KIND_RE = new RegExp(`\\bkind=(${ID_TOKEN})`);
const META_ARC_RE = new RegExp(`\\barc=(${ID_TOKEN})`);
const META_IU_RE = new RegExp(`\\biu=(${ID_TOKEN})`);

// A gitBranch worktree convention iu/<id> (loop-runner) → the iu id, where <id> is ID_RE-clean.
const BRANCH_IU_RE = new RegExp(`^iu/(${ID_TOKEN})$`);

/** Extract the text of the FIRST user message of a transcript (the dispatch prompt for a subagent). */
function firstUserText(entries: TranscriptEntry[]): string | null {
  for (const e of entries) {
    if (e.type !== "user") continue;
    const msg = e.message;
    if (!msg || typeof msg !== "object") continue;
    const content = (msg as { content?: unknown }).content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      const text = content
        .map((c) => (c && typeof c === "object" && typeof (c as { text?: unknown }).text === "string" ? (c as { text: string }).text : ""))
        .join("\n");
      if (text.trim() !== "") return text;
    }
  }
  return null;
}

/** Parse a META: line out of a dispatch prompt. Returns the bounded, allowlist-validated triple+iu,
 *  or null when no usable carrier could be read. carrier_kind / arc that fall outside their closed
 *  allowlists degrade to null (never echoed free-form). */
export function parseMeta(promptText: string | null): AttributionTriple | null {
  if (!promptText) return null;
  // Only consider a line that actually starts a META envelope, to keep the match bounded.
  const metaLine = promptText.split("\n").find((l) => /\bMETA:/.test(l));
  const scope = metaLine ?? promptText;

  const carrierM = scope.match(META_CARRIER_RE);
  if (!carrierM || !ID_RE.test(carrierM[1])) return null; // no clean carrier → not a usable META

  const kindM = scope.match(META_KIND_RE);
  const arcM = scope.match(META_ARC_RE);
  const iuM = scope.match(META_IU_RE);

  const carrier_kind = kindM && CARRIER_KINDS.has(kindM[1]) ? kindM[1] : null;
  const arc = arcM && ARCS.has(arcM[1]) ? arcM[1] : null;
  const iu = iuM && ID_RE.test(iuM[1]) ? iuM[1] : null;

  return { carrier: carrierM[1], carrier_kind, arc, iu };
}

/** Session-level fallback: derive an iu id from the gitBranch worktree convention (iu/<id>). No
 *  carrier_kind / arc are derivable from a branch alone, so they stay null. cwd is NOT parsed into an
 *  id (it is a filesystem path — free-text — and is never emitted); it is reserved for a future,
 *  allowlist-bounded mapping. */
export function sessionLevelAttribution(meta: TranscriptMeta): AttributionTriple {
  if (typeof meta.gitBranch === "string") {
    const m = meta.gitBranch.match(BRANCH_IU_RE);
    if (m && ID_RE.test(m[1])) {
      // The iu id is the only clean signal; carrier defaults to the iu id (best-effort, bounded),
      // kind/arc remain null so the publisher's resolveTriple excludes it from a carrier projection
      // rather than asserting a wrong (kind, arc) pair.
      return { carrier: m[1], carrier_kind: null, arc: null, iu: m[1] };
    }
  }
  return { ...NULL_ATTRIBUTION };
}

/**
 * Resolve a transcript's attribution: META line first (dispatched sessions), then session-level
 * (gitBranch), then null. NEVER a wrong carrier.
 */
export function resolveAttribution(entries: TranscriptEntry[], meta: TranscriptMeta): AttributionTriple {
  if (meta.isSubagent) {
    const fromMeta = parseMeta(firstUserText(entries));
    if (fromMeta) return fromMeta;
  }
  return sessionLevelAttribution(meta);
}
