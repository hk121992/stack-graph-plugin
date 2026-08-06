// scan-sg-tags.ts — the CLOSED additive `<sg-*>` model-family scan (IU-5, DR3/DR15), METRICS-ONLY.
//
// SEPARATE from parse-signal.ts. parse-signal.ts owns the DURABLE `<sg-signal>` verdict path
// (experience-contract / trend metrics on enter/exit rows) — a separate channel, unchanged and NOT a
// family member. THIS module is the process-tag capture channel: it scans a transcript's assistant text
// for EVERY registered MODEL `<sg-*>` member, gates each by SHAPE against sg-registry.ts, and surfaces
// each surviving tag as a PROPOSAL. It NEVER enacts a durable store write — a forged or stray tag can at
// most propose, never durably mutate state.
//
// ALL-TURNS SCAN (DR3, the F2 fix). The scan reads EVERY assistant entry's text (not the final message
// only), so a tag stated on any turn is captured. Tags dedup at `message.id` grain (DR15): one proposal
// per (message.id, tag, body), immune to a duplicated JSONL entry (streamed / retry). An entry with no
// message.id never collapses (each counts on its own).
//
// FAIL-CLOSED BODY GATE (DR3). A registered member's body must be STRICT SINGLE-LINE JSON. A multi-line
// (YAML-ish or pretty-printed) or non-JSON body for a registered member is a PARSE-DROP — counted, so a
// drifting emitter is visible in the trust strip, never silent. A non-member tag name is simply ignored
// (not a parse-drop). The floor's UNPAIRED prose listing carries no closing tag, so it never matches.
//
// PROPOSAL-GATED, CONTEXT-DISCRIMINATED. Each tag is a PROPOSAL to an ATTENDED invoke-gate. The
// attended-vs-dispatched signal is `meta.isSubagent` (a `<session>/subagents/agent-*.jsonl` transcript
// is dispatched): ATTENDED → `surfaced`; DISPATCHED → `proposal-only`. Two inputs differing ONLY in
// `isSubagent` produce the two outcomes; the disposition is NEVER read off the body.
//
// PORTABILITY: pure types + small pure functions + JSON only (no fs/Bun globals).

import { SG_MEMBER_TAGS, isRegisteredAndValid } from "./sg-registry.ts";
import { projectSgProposalFields, ANALYZER_EVENT_V, normalizeTs } from "./schema.ts";
import type { TranscriptEntry, TranscriptMeta, SgProposalRow } from "./schema.ts";

/** Whether a surfaced proposal reaches an attended invoke-gate in-context. */
export type ProposalDisposition = "surfaced" | "proposal-only";

/** One captured `<sg-*>` proposal. METRICS-ONLY — never enacted as a durable write. */
export interface SgProposal {
  /** The registered family-member tag name (without angle brackets), e.g. "sg-friction". */
  tag: string;
  /** The session the proposal was captured in. */
  session: string;
  /** `surfaced` for an attended (top-level) transcript; `proposal-only` for a dispatched (subagent)
   *  one — the context discrimination, bound from `meta.isSubagent`, never the body. */
  disposition: ProposalDisposition;
  /** The shape-valid, JSON-parsed body of the tag. Carried so the gate can inspect the proposal; it is
   *  never written to any durable store by this scan. */
  body: unknown;
  /** The `message.id` the tag was emitted in — the dedup grain — or null for an entry with no id.
   *  Optional so an existing consumer (the operator-action bridge) may construct a proposal without it. */
  messageId?: string | null;
  /** The tag-bearing message's strict-UTC-normalised instant, or null when unparseable. Optional (as above). */
  ts?: string | null;
}

/** The result of scanning one or more transcripts: the deduped proposals plus the aggregate parse-drop
 *  count (registered-member tags whose body failed the strict single-line JSON gate) plus the scan-cap
 *  count (per-entry ReDoS bounds hit — see SG_SCAN_MAX_*). Both counts ride the trust strip (IU-8). */
export interface SgScanResult {
  proposals: SgProposal[];
  parseDrops: number;
  scanCapHits: number;
}

/** Match EVERY `<sg-*>` paired tag (any member name) and capture (tagName, innerBody). Bounded to the
 *  `<sg-…>…</sg-…>` shape with a back-reference so open/close names must match; the body is JSON.parsed,
 *  never eval'd. Global + non-greedy so multiple distinct tags in one message are each seen. Membership
 *  is decided by the registry, not the regex. */
const SG_ANY_TAG_RE = /<(sg-[a-z][a-z-]*)>([\s\S]*?)<\/\1>/g;

// ReDoS bound (IU-8, IU-5's deferred scan-cap): the lazy `[\s\S]*?` + backref `\1` above backtracks
// QUADRATICALLY on the adversarial vector — many `<sg-...>` opens with NO matching close force the lazy
// quantifier to rescan to end-of-string from every open position within a single `.exec` (which then
// returns null, so the IN-LOOP match cap can NEVER interrupt it). THREE per-entry bounds, all applied as
// cheap O(n) pre-checks BEFORE the regex, so a breach is caught in bounded time and COUNTED (`scanCapHits`
// -> the `scan-cap` trust-strip counter) — visible, never a silent multi-second burn:
//   (1) input-length cap  — an over-length entry is not scanned;
//   (2) OPEN-COUNT cap    — the load-bearing ReDoS bound: an entry with too many `<sg-` opens (the
//                            quadratic vector) is not scanned. Counting the OPENS (matched or not), linearly
//                            with an early bail, is what bounds the backtracking — the match cap (successful
//                            matches only) does not, since the vector yields zero matches;
//   (3) match cap         — a secondary in-loop bound on captured matches (< the open cap, so both bite).
// The worst SCANNED entry is thus bounded by (open cap x input cap) char-ops — sub-second (~150ms measured
// at the 2048-opens x 64 KiB ceiling), not the ~6s the unbounded scan cost.
export const SG_SCAN_MAX_INPUT_CHARS = 65536; // 64 KiB per assistant entry
export const SG_SCAN_MAX_OPENS = 2048;        // `<sg-` opens per entry (cheap linear pre-count — the ReDoS bound)
export const SG_SCAN_MAX_MATCHES = 1024;      // `<sg-*>` regex matches per entry (< the open cap, so both bite)

/** Count `<sg-` opens in `text`, bailing the instant the count exceeds `limit` — so the count is O(n) with
 *  an early exit and never walks a pathological input further than `limit + 1` opens. This is the cheap
 *  pre-check that bounds SG_ANY_TAG_RE's quadratic backtracking (the vector is OPENS, not matches). */
function countSgOpens(text: string, limit: number): number {
  let n = 0;
  for (let idx = text.indexOf("<sg-"); idx !== -1; idx = text.indexOf("<sg-", idx + 4)) {
    if (++n > limit) break;
  }
  return n;
}

/** Concatenate ONE assistant entry's text (string content, or an array of {type:"text", text} blocks). */
function entryText(entry: TranscriptEntry): string | null {
  const msg = entry.message;
  if (!msg || typeof msg !== "object") return null;
  const content = (msg as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (c && typeof c === "object" && typeof (c as { text?: unknown }).text === "string" ? (c as { text: string }).text : ""))
      .join("\n");
  }
  return null;
}

/** The `message.id` off an assistant entry, or null when the entry carries none. */
function entryMessageId(entry: TranscriptEntry): string | null {
  const msg = entry.message;
  if (!msg || typeof msg !== "object") return null;
  const id = (msg as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

/** Stable canonical JSON of a parsed body (top-level keys sorted) — the body component of the dedup
 *  identity, so a key-order difference between two duplicated entries never reads as two proposals. */
function canonicalBody(body: unknown): string {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const o = body as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) sorted[k] = o[k];
    return JSON.stringify(sorted);
  }
  return JSON.stringify(body);
}

/**
 * Scan ONE transcript's ASSISTANT text (all turns) for registered `<sg-*>` model proposals. Returns the
 * deduped proposals (one per (message.id, tag, body)) plus the parse-drop count. A non-member name or a
 * shape-invalid body is DROPPED (honest under-capture); a member body that is not strict single-line
 * JSON increments `parseDrops`. METRICS-ONLY: reads bytes, returns proposals + a count; performs NO write.
 */
export function scanSgTagsResult(entries: TranscriptEntry[], meta: TranscriptMeta): SgScanResult {
  const disposition: ProposalDisposition = meta.isSubagent ? "proposal-only" : "surfaced";
  const proposals: SgProposal[] = [];
  const seen = new Set<string>();
  let parseDrops = 0;
  let scanCapHits = 0;

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.type !== "assistant") continue;
    const text = entryText(e);
    if (!text) continue;
    // ReDoS bounds — cheap O(n) pre-checks BEFORE the O(n²)-capable regex; a breach skips the scan + counts.
    //   (1) input-length cap; (2) OPEN-COUNT cap — the load-bearing bound: many `<sg-` opens with no close
    //   is the quadratic vector, and it yields ZERO successful matches, so only counting the OPENS catches it
    //   (the in-loop match cap never fires on it). countSgOpens bails early, so this stays linear.
    if (text.length > SG_SCAN_MAX_INPUT_CHARS) { scanCapHits++; continue; }
    if (countSgOpens(text, SG_SCAN_MAX_OPENS) > SG_SCAN_MAX_OPENS) { scanCapHits++; continue; }
    const mid = entryMessageId(e);
    const ts = normalizeTs(e.timestamp);

    SG_ANY_TAG_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    let matchCount = 0;
    while ((m = SG_ANY_TAG_RE.exec(text)) !== null) {
      // ReDoS match cap — stop scanning this entry after the bound; counted so the truncation is visible.
      if (++matchCount > SG_SCAN_MAX_MATCHES) { scanCapHits++; break; }
      const tag = m[1];
      // Fast membership reject: a `<sg-*>`-shaped tag whose name is not a registered member is ignored
      // (never a parse-drop — it is simply not one of ours).
      if (!SG_MEMBER_TAGS.has(tag)) continue;

      const raw = m[2].trim();
      const idKey = mid ?? `noid:${i}`;

      // Strict single-line JSON, fail-closed. A multi-line (YAML-ish / pretty) or non-JSON body for a
      // REGISTERED member is a parse-drop — deduped at message.id grain so a duplicated JSONL entry
      // (streamed / retry) never double-counts the same malformed emission.
      let body: unknown;
      let parsed = false;
      if (!raw.includes("\n")) {
        try { body = JSON.parse(raw); parsed = true; } catch { /* non-JSON → parse-drop below */ }
      }
      if (!parsed) {
        const dropKey = JSON.stringify(["drop", idKey, tag, raw]);
        if (!seen.has(dropKey)) { seen.add(dropKey); parseDrops++; }
        continue;
      }

      if (!isRegisteredAndValid(tag, body)) continue; // shape-invalid body for this member → drop

      // Dedup per (message.id, tag, body). Entries with no message.id never collapse (unique index key).
      const okKey = JSON.stringify(["ok", idKey, tag, canonicalBody(body)]);
      if (seen.has(okKey)) continue;
      seen.add(okKey);

      proposals.push({ tag, session: meta.sessionId, disposition, body, messageId: mid, ts });
    }
  }
  return { proposals, parseDrops, scanCapHits };
}

/**
 * Scan a set of parsed transcripts for ALL `<sg-*>` model proposals (the global metrics-only scan).
 * Pure: same parsed transcripts in ⇒ the same result out (the caller may sort). Never writes.
 */
export function scanAllSgTagsResult(
  parsed: readonly { entries: TranscriptEntry[]; meta: TranscriptMeta }[],
): SgScanResult {
  const proposals: SgProposal[] = [];
  let parseDrops = 0;
  let scanCapHits = 0;
  for (const p of parsed) {
    const r = scanSgTagsResult(p.entries, p.meta);
    proposals.push(...r.proposals);
    parseDrops += r.parseDrops;
    scanCapHits += r.scanCapHits;
  }
  return { proposals, parseDrops, scanCapHits };
}

/** BACKWARD-COMPATIBLE array views. `deriveAll` (analyze.ts) consumes the proposal ARRAY; the parse-drop
 *  and scan-cap counts ride the `*Result` variants for the trust strip (IU-8) — so wiring the counters in
 *  never forces a change on the array consumer. */
export function scanSgTags(entries: TranscriptEntry[], meta: TranscriptMeta): SgProposal[] {
  return scanSgTagsResult(entries, meta).proposals;
}
export function scanAllSgTags(
  parsed: readonly { entries: TranscriptEntry[]; meta: TranscriptMeta }[],
): SgProposal[] {
  return scanAllSgTagsResult(parsed).proposals;
}

/**
 * Bridge ONE captured `<sg-*>` proposal into a DURABLE, bounded `SgProposalRow` — or `null` when the
 * member does not persist as an sg-proposal row (`sg-operator-action` rides its own operator-action row
 * + lifecycle; an unknown / not-yet-projected member has no projection). THE LOAD-BEARING SECURITY
 * PROPERTY: the raw `proposal.body` is NEVER carried — the row is built field-by-field, value-by-value
 * via `projectSgProposalFields` (schema.ts), so a shape-valid-but-free-text value is DR4-sanitised or
 * scrubbed before it can reach the derived log. `disposition` is bound from the scan's attended/
 * dispatched context, never the body. `ts` is supplied by the caller (the tag-bearing instant).
 */
export function rowFromProposal(proposal: SgProposal, ts: string): SgProposalRow | null {
  const fields = projectSgProposalFields(proposal.tag, proposal.body);
  if (!fields) return null;
  return {
    ts,
    kind: "sg-proposal",
    disposition: proposal.disposition,
    fields,
    session: proposal.session,
    v: ANALYZER_EVENT_V,
  };
}
