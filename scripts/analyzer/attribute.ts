// attribute.ts — resolve the (carrier, carrier_kind, arc, iu, harness_id, stage) attribution for a
// transcript (Cluster A §3.5; recut by IU-1 `analyzer-attribution-recut`, wi-analyzer-refinement DR1/DR10).
//
// The in-context hook KNEW the carrier; a batch analyzer must DERIVE it, and the iron rule is:
// NEVER a wrong attribution — an unresolvable signal degrades to null, never to a guessed carrier.
// The publisher's resolveTriple (closed CARRIER_KINDS / ARCS allowlists) is the final guard; the
// analyzer produces TO it.
//
// ATTRIBUTION SIGNALS (IU-1, DR1). Two sources, in precedence order:
//
//   1. The dispatch `META:` envelope — in the FIRST user message of a
//      <session>/subagents/agent-*.jsonl transcript (the dispatch prompt the PARENT wrote; a
//      sub-agent cannot author its own first user message). The form dispatch/build briefs emit:
//        META: carrier=<id> kind=<work-item|standalone-iu> arc=<dev-sprint|incremental> iu=<id>
//              harness=<id> stage=<STAGES member>
//      read via BOUNDED regexes over the allowlisted kind/arc/stage vocab and the ID grammar.
//   2. Host-recorded CARRIER-OPERAND TOOL EVENTS (the attended-session path; also an envelope-less
//      dispatch), in TWO SIGNAL CLASSES:
//        • SPAN-OPENING — a stage-skill invocation (`Skill`/`Agent`/`Task` tool_use) whose args carry
//          the carrier token (the CARRIER_ARG_RE grammar, schema.ts): attribution is span-scoped from
//          that event forward; the NEXT span-opening event re-targets; none ⇒ honest-null.
//        • POINT — a defined script invocation carrying a carrier operand (preamble `--carrier-id`,
//          record-gate `--carrier`, through Bash): attributes ITS OWN ACT only, corroborates the
//          span, and NEVER re-targets a running span — a gate-signing sweep across carriers A/B/C
//          must not relabel the session's tail (the F1 inertia class, reborn via point events, is
//          designed out). record-gate's `--carrier` operand is a FILE PATH: normalised
//          basename-minus-`.md`, ID_RE-validated (`normalizeCarrierOperand`).
//      Only ASSISTANT-entry tool_use blocks are read — host-recorded acts. Assistant TEXT and
//      tool_result echoes are NEVER scanned (a body that merely reproduces a preamble, a command
//      line, or a `carrier=` token cannot mint a signal — the forge-rejection, IU-A3).
//
// THE BRANCH FALLBACK IS GONE (IU-1; F1). The carrier-named `gitBranch` `iu/<carrier>` was measured
// 0% correct as an attended-session signal (a lingering checkout mis-attributed every later session);
// `sessionLevelAttribution` / `BRANCH_CARRIER_RE` are DELETED, not narrowed. A branch-only session
// yields NO carrier — honest-null, never plausible-but-wrong.
//
// TRUST RULE (DR1, operator-directed): operand args are model-chosen — this is deliberate. The
// mitigation is validation (ID_RE shape always; existence against the `--carriers` ledger manifest
// when supplied) + per-signal-class conservatism (points never re-target) + trust-strip visibility
// (missing-arg and unresolvable-id aggregate counts), replacing the old unforgeable-but-wrong branch
// signal with observable-and-auditable acts.
//
// `harness_id` (IU-A2a): part of the attribution KEY so two same-named carriers under DIFFERENT
// harnesses never collide across the fleet. ABSENT ⇒ null (a clearly-local/unknown sentinel) — NEVER
// inherited from another field, defaulted to another harness's id, or fabricated.
//
// `stage` (IU-1, DR10): the envelope's bounded `stage=` field, ∈ STAGES (schema.ts, exported once).
// An unlisted value degrades to null + the `stage-unknown` count; an envelope-less dispatch gets
// `stage: null` + the `envelope-missing` count. `stage` NEVER inherits across the dispatch tree —
// `propagateFromRoot` fills carrier IDENTITY only.

import {
  ID_RE,
  CARRIER_KINDS,
  ARCS,
  STAGES,
  NULL_ATTRIBUTION,
  extractCarrierArg,
  normalizeTs,
  stripSgNamespace,
} from "./schema.ts";
import type { TranscriptEntry, TranscriptMeta, AttributionTriple, AnomalyClass } from "./schema.ts";

// Bounded token grammars for the META fields — each is anchored to a single line of values and
// length-capped, so a hostile prompt cannot smuggle free-text through (locality §9 S1). The id
// grammar mirrors the publisher's ID_RE character class.
const ID_TOKEN = "[A-Za-z0-9][A-Za-z0-9._-]{0,63}";
const META_CARRIER_RE = new RegExp(`\\bcarrier=(${ID_TOKEN})`);
const META_KIND_RE = new RegExp(`\\bkind=(${ID_TOKEN})`);
const META_ARC_RE = new RegExp(`\\barc=(${ID_TOKEN})`);
const META_IU_RE = new RegExp(`\\biu=(${ID_TOKEN})`);
const META_HARNESS_RE = new RegExp(`\\bharness=(${ID_TOKEN})`);
const META_STAGE_RE = new RegExp(`\\bstage=(${ID_TOKEN})`);

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

/** The bounded scope a META parse reads: the line that actually starts a META envelope, falling back
 *  to the whole prompt. ONE definition — parseMeta and the stage-conformance counter both read this,
 *  so the parse and the count can never drift onto different scopes. */
function metaScope(promptText: string): string {
  return promptText.split("\n").find((l) => /\bMETA:/.test(l)) ?? promptText;
}

/** Parse a META: line out of a dispatch prompt. Returns the bounded, allowlist-validated
 *  triple+iu+harness+stage, or null when no usable carrier could be read. carrier_kind / arc / stage
 *  that fall outside their closed allowlists degrade to null (never echoed free-form). */
export function parseMeta(promptText: string | null): AttributionTriple | null {
  if (!promptText) return null;
  // Only consider a line that actually starts a META envelope, to keep the match bounded.
  const scope = metaScope(promptText);

  const carrierM = scope.match(META_CARRIER_RE);
  if (!carrierM || !ID_RE.test(carrierM[1])) return null; // no clean carrier → not a usable META

  const kindM = scope.match(META_KIND_RE);
  const arcM = scope.match(META_ARC_RE);
  const iuM = scope.match(META_IU_RE);
  const harnessM = scope.match(META_HARNESS_RE);

  const carrier_kind = kindM && CARRIER_KINDS.has(kindM[1]) ? kindM[1] : null;
  const arc = arcM && ARCS.has(arcM[1]) ? arcM[1] : null;
  const iu = iuM && ID_RE.test(iuM[1]) ? iuM[1] : null;
  // harness_id: present-and-clean → the id; absent or non-conforming → null. NEVER inherited from
  // another field, defaulted to another harness's id, or fabricated (the honest-degradation rule).
  const harness_id = harnessM && ID_RE.test(harnessM[1]) ? harnessM[1] : null;
  // stage: the shared classifier (one definition with the conformance counter — never divergent).
  return { carrier: carrierM[1], carrier_kind, arc, iu, harness_id, stage: stageConformance(scope).stage };
}

/** Classify the envelope's `stage=` field over one META scope: the parsed stage (a bounded token ∈
 *  the closed STAGES set, else null) plus its conformance anomaly — `stage-missing` (no `stage=`
 *  token at all) or `stage-unknown` (a value was supplied but is not a known stage — including a
 *  value that fails the bounded token grammar, e.g. `stage=_build`). ONE classifier consumed by
 *  BOTH parseMeta (the stage value) and attributeTranscript (the conformance count), so the parsed
 *  stage and the counted anomaly can never diverge. */
function stageConformance(scope: string): { stage: string | null; anomaly: "stage-missing" | "stage-unknown" | null } {
  if (!/\bstage=/.test(scope)) return { stage: null, anomaly: "stage-missing" };
  const m = scope.match(META_STAGE_RE);
  const stage = m && STAGES.has(m[1]) ? m[1] : null;
  return { stage, anomaly: stage === null ? "stage-unknown" : null };
}

// ── IU-1 — the two carrier-signal classes over host-recorded tool events (DR1) ────────────────────

/** The signal class: `span` opens/re-targets carrier attribution from its event forward; `point`
 *  attributes its own act only and never re-targets. */
export type CarrierSignalClass = "span" | "point";

/** A span-class carrier signal. `carrier: null` is the MANIFEST-REJECTED span opening (a
 *  well-formed operand id absent from `--carriers`): still an ATTRIBUTION BOUNDARY — the running
 *  span closes at it (the session's tail must not keep accruing to the previous carrier when the
 *  operator re-targeted toward an unknown id) — but it opens nothing (correct-or-null: the unknown
 *  id never attributes). */
export interface SpanSignal {
  class: "span";
  carrier: string | null;
  index: number;
  ts: string | null;
}

/** A point-class carrier signal — ALWAYS a resolved carrier (a rejected point operand is counted
 *  and dropped, never emitted; a point never affects spans). The non-null carrier is
 *  compiler-enforced here so IU-3/IU-8's point consumers never null-guard an impossible case. */
export interface PointSignal {
  class: "point";
  carrier: string;
  index: number;
  ts: string | null;
}

/** One validated carrier-operand tool event — a discriminated union on `class`. `index` is the
 *  event's position in the transcript's monotonic entry order (the windowing coordinate); `ts` its
 *  normalised instant (or null). */
export type CarrierSignal = SpanSignal | PointSignal;

/** One carrier attribution span: `[fromIndex, toIndex)` over the transcript's entry order —
 *  `toIndex` null = open to the transcript end. Entries BEFORE the first span are unattributed
 *  (the honest-null head); IU-3 splits usage per span. */
export interface CarrierSpan {
  carrier: string;
  fromIndex: number;
  toIndex: number | null;
  fromTs: string | null;
  toTs: string | null;
}

/** The mutable per-transcript anomaly tally (aggregate counts, never per-event spam). */
export type AnomalyCounts = Partial<Record<AnomalyClass, number>>;

export interface AttributeOptions {
  /** The known carrier-id set (the `--carriers` ledger manifest). When supplied, an ID_RE-clean
   *  operand id ABSENT from it is REJECTED (correct-or-null) and counted `carrier-unresolvable`.
   *  null/undefined ⇒ existence validation off (ID_RE shape validation always applies). */
  carriers?: ReadonlySet<string> | null;
  /** Optional anomaly-count collector, mutated in place. `scanCarrierSignals` bumps it directly;
   *  `attributeTranscript` keeps its OWN per-transcript tally (the returned `.anomalies`) and
   *  FOLDS it into this collector at return — a collector shared across a corpus accumulates,
   *  while each return stays per-transcript (never an alias). */
  counts?: AnomalyCounts;
}

function bump(counts: AnomalyCounts | undefined, cls: AnomalyClass): void {
  if (counts) counts[cls] = (counts[cls] ?? 0) + 1;
}

// The span-opening tool names — a stage-skill / sub-agent spawn invocation whose args can carry the
// carrier token. "Task" is the recorded name of the sub-agent spawn tool on current hosts; "Agent"
// its newer alias — both are the DR1 `Agent` surface.
const SPAN_TOOLS = new Set(["Skill", "Agent", "Task"]);

// The defined point-signal scripts (DR1): the jit-preamble and the record-gate runner. A Bash
// command is a point CANDIDATE only when it INVOKES one of these — the script token must sit in an
// execution position: either launched by a known interpreter (`bun [run]` / `python[3]` / `node` /
// `deno [run]`, possibly with a quoted/`$`-expanded path prefix) or in direct command position
// (start of command / after a shell separator, as a bare path token). A command that merely
// MENTIONS the script — an echo, a grep pattern, a cat of the source — is NOT an invocation and
// never a signal. (A full launcher phrase quoted INSIDE another command's argument still matches —
// full shell parsing is out of scope; the blast radius is a point act, never a span or the session
// carrier.)
const POINT_SCRIPT_PATH = String.raw`[A-Za-z0-9_.$/{}"'~()\\-]*\/`;
// A shell separator includes the newline/carriage-return command boundary; a direct-position
// invocation may carry leading VAR=value environment assignments (`SG_EVENT_LOG=/x ./script`).
const POINT_SCRIPT_RE = new RegExp(
  String.raw`(?:(?:^|[;&|\r\n]\s*)(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*(?:${POINT_SCRIPT_PATH})?|\b(?:bun(?:\s+run)?|python3?|node|deno(?:\s+run)?)\s+(?:${POINT_SCRIPT_PATH})?)(?:preamble\.py|record-gate\.ts)\b`,
);

// The stage-skill id set for the `carrier-arg-missing` conformance count: an invocation whose
// (prefix-stripped) skill / subagent_type names a STAGES member is carrier-consuming by convention
// (IU-9 makes the carrier argument compulsory in those arg contracts). Non-stage skills are exempt
// — so are the preamble's carrier-CREATING invocations (no --carrier-id is a valid quiet form),
// which is why a defined-script Bash call without an operand is NOT counted.
function isStageSkillId(id: string | undefined): boolean {
  return typeof id === "string" && STAGES.has(stripSgNamespace(id));
}

/** Join every string-valued field of a tool_use input into one scan surface (the args text). */
function inputText(input: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const v of Object.values(input)) if (typeof v === "string") parts.push(v);
  return parts.join("\n");
}

/**
 * Scan a transcript's ASSISTANT tool_use events for carrier-operand signals (the DR1 two classes).
 * Returns the validated signals in monotonic entry order. Validation: every capture rides
 * `normalizeCarrierOperand` (basename-minus-.md + ID_RE), and — when `opts.carriers` is supplied —
 * existence against the ledger manifest (a well-formed id absent from it is REJECTED and counted
 * `carrier-unresolvable`, never attributed). A stage-skill invocation with NO valid token is counted
 * `carrier-arg-missing`. Echo-immune by construction: only `type:"assistant"` entries' tool_use
 * blocks are read — never assistant text, never tool_result content, never user-entry blocks.
 */
export function scanCarrierSignals(entries: TranscriptEntry[], opts: AttributeOptions = {}): CarrierSignal[] {
  const carriers = opts.carriers ?? null;
  const signals: CarrierSignal[] = [];

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.type !== "assistant") continue; // host-recorded assistant acts only (echo-immunity)
    const msg = e.message;
    if (!msg || typeof msg !== "object") continue;
    const content = (msg as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const b = block as { type?: unknown; name?: unknown; input?: unknown };
      if (b.type !== "tool_use" || typeof b.name !== "string") continue;
      const input = b.input && typeof b.input === "object" && !Array.isArray(b.input) ? (b.input as Record<string, unknown>) : {};

      if (SPAN_TOOLS.has(b.name)) {
        const id = extractCarrierArg(inputText(input)); // the canonical grammar+normalise composition
        const stageSkill = isStageSkillId(
          (typeof input.skill === "string" ? input.skill : undefined) ??
            (typeof input.subagent_type === "string" ? input.subagent_type : undefined),
        );
        if (id === null) {
          // No extractable/valid token. Nonconforming ONLY for a stage-skill invocation (the
          // carrier-consuming set); other Skill/Agent uses are exempt.
          if (stageSkill) bump(opts.counts, "carrier-arg-missing");
          continue;
        }
        if (carriers && !carriers.has(id)) {
          // Well-formed but unknown → REJECTED (correct-or-null) and visible. The event is still an
          // ATTRIBUTION BOUNDARY: it closes the running span (a re-target toward an unknown id must
          // not leave the previous carrier attributing the tail — the span-inertia class), but it
          // opens nothing (carrier: null).
          bump(opts.counts, "carrier-unresolvable");
          signals.push({ class: "span", carrier: null, index: i, ts: normalizeTs(e.timestamp) });
          continue;
        }
        signals.push({ class: "span", carrier: id, index: i, ts: normalizeTs(e.timestamp) });
      } else if (b.name === "Bash") {
        const command = typeof input.command === "string" ? input.command : "";
        if (!POINT_SCRIPT_RE.test(command)) continue; // not a defined-script INVOCATION → never a signal
        const id = extractCarrierArg(command); // the canonical grammar+normalise composition
        // An operand-less defined-script call is NOT counted: the preamble's carrier-creating
        // invocation legitimately passes no --carrier-id (the valid quiet form).
        if (id === null) continue;
        if (carriers && !carriers.has(id)) {
          // Counted and dropped — a point attributes its own act only, so a rejected point is
          // never a boundary (it could not have re-targeted anything anyway).
          bump(opts.counts, "carrier-unresolvable");
          continue;
        }
        signals.push({ class: "point", carrier: id, index: i, ts: normalizeTs(e.timestamp) });
      }
    }
  }
  return signals;
}

/**
 * Fold the SPAN-class signals into carrier spans over the transcript's entry order: each
 * span-opening event re-targets attribution from its index forward; consecutive openings on the
 * SAME carrier coalesce into one span (a re-invocation is not a new span, while the span is still
 * open). A `carrier: null` span signal — a manifest-REJECTED opening — is a BOUNDARY: it closes
 * the running span and opens nothing (the tail after it is unattributed; correct-or-null).
 * POINT-class signals are ignored here BY DESIGN — a point attributes its own act only and never
 * opens or re-targets a span. Entries before the first span belong to no span (the honest-null head).
 */
export function spansFromSignals(signals: CarrierSignal[]): CarrierSpan[] {
  const spans: CarrierSpan[] = [];
  for (const s of signals) {
    if (s.class !== "span") continue;
    const last = spans[spans.length - 1];
    const lastOpen = last !== undefined && last.toIndex === null;
    if (s.carrier === null) {
      // The rejected-opening boundary: close the running span; open nothing.
      if (lastOpen) {
        last.toIndex = s.index;
        last.toTs = s.ts;
      }
      continue;
    }
    if (lastOpen && last.carrier === s.carrier) continue; // same-carrier re-open — the span continues
    if (lastOpen) {
      last.toIndex = s.index; // the previous span ends where this one opens (exclusive)
      last.toTs = s.ts;
    }
    spans.push({ carrier: s.carrier, fromIndex: s.index, toIndex: null, fromTs: s.ts, toTs: null });
  }
  return spans;
}

/** The full per-transcript attribution product: the session-level triple (correct-or-null), the
 *  carrier spans (IU-3 splits usage over them), the point acts, and the aggregate anomaly tally.
 *
 *  `ambiguous` distinguishes the TWO kinds of null carrier: AMBIGUITY — the transcript's own
 *  signals CONTRADICT (multiple distinct span carriers, or a manifest-rejected re-target boundary)
 *  — versus ABSENCE (no signal at all). The distinction is load-bearing for the tree pass: an
 *  ambiguous session must NEVER be back-filled from an ancestor (its own acts named other
 *  carriers; inheriting would stamp an attribution the transcript's own signals contradict),
 *  while a signal-less session legitimately inherits (IU-A4 fill-null-only). */
export interface TranscriptAttribution {
  own: AttributionTriple;
  spans: CarrierSpan[];
  points: PointSignal[];
  anomalies: AnomalyCounts;
  ambiguous: boolean;
}

/**
 * Resolve ONE transcript's attribution (in isolation — the tree pass inherits separately):
 *
 *   • DISPATCHED (subagent) with a usable META envelope → the envelope's triple, whole-transcript
 *     (the dispatch prompt is parent-written — a sub-agent cannot author its own first user
 *     message). `stage` conformance is counted (`stage-missing` / `stage-unknown`).
 *   • Otherwise (attended; or an envelope-less dispatch, counted `envelope-missing`) → the
 *     SIGNAL-DERIVED path: carrier spans from span-opening events; the session-level carrier is
 *     single-distinct-span-or-null (a session spanning A→B is ambiguous at session grain — IU-3
 *     emits per-span usage; nothing here guesses). kind/arc/iu/harness/stage stay null — an operand
 *     names the carrier only.
 *
 * The operand scan runs for EVERY transcript (the anomaly tally accrues even under an envelope);
 * spans/points are always reported. NEVER a wrong carrier; NEVER a signal from echoed text.
 */
export function attributeTranscript(
  entries: TranscriptEntry[],
  meta: TranscriptMeta,
  opts: AttributeOptions = {},
): TranscriptAttribution {
  // A FRESH per-transcript tally, always — the returned `.anomalies` is never an alias of the
  // caller's collector (a shared `opts.counts` across a corpus would otherwise read cross-transcript
  // running totals off every return). The local tally folds INTO `opts.counts` exactly once, at
  // return (foldCounts below).
  const anomalies: AnomalyCounts = {};
  const signals = scanCarrierSignals(entries, { carriers: opts.carriers ?? null, counts: anomalies });
  const spans = spansFromSignals(signals);
  const points = signals.filter((s): s is PointSignal => s.class === "point");

  if (meta.isSubagent) {
    // The META line rides the FIRST user message = the dispatch prompt the PARENT wrote. `firstUserText`
    // returns that first message, never a later assistant echo or tool_result, so an in-session agent
    // cannot inject a forged META here. DELIBERATE EXEMPTION: the envelope's carrier is NOT checked
    // against the `--carriers` manifest — the envelope is machine-written from the carrier record by
    // dispatch (a different trust class from a model-typed operand), and a cross-collection dispatch
    // may legitimately name a carrier outside this harness's local ledger. The manifest validates
    // OPERAND signals only (DR1's model-chosen class).
    const promptText = firstUserText(entries);
    const fromMeta = parseMeta(promptText);
    if (fromMeta) {
      // Envelope stage conformance — the SAME classifier parseMeta's stage value came from.
      const { anomaly } = stageConformance(metaScope(promptText ?? ""));
      if (anomaly) bump(anomalies, anomaly);
      foldCounts(opts.counts, anomalies);
      // The parent-written envelope SETTLES identity — never ambiguous (operand signals inside the
      // transcript are reported via spans/points but do not contest the envelope).
      return { own: fromMeta, spans, points, anomalies, ambiguous: false };
    }
    // An envelope-less dispatch: stage stays null (DR10 — excluded from stage rollups, visible in
    // the conformance count); its own operand signals may still attribute it below.
    bump(anomalies, "envelope-missing");
  }

  // The signal-derived session-level carrier: single-distinct-span-or-null (correct-or-null). A
  // manifest-REJECTED span opening (a null-carrier boundary signal) also nulls the session grain:
  // the session was re-targeted toward an id that never resolved, so a single surviving span does
  // not make the whole session unambiguous. Either condition marks the transcript AMBIGUOUS —
  // contradictory signals, not absence — so the tree pass never back-fills it from an ancestor.
  const rejectedBoundary = signals.some((s) => s.class === "span" && s.carrier === null);
  const distinct = new Set(spans.map((s) => s.carrier));
  const ambiguous = rejectedBoundary || distinct.size > 1;
  const carrier = distinct.size === 1 && !rejectedBoundary ? spans[0].carrier : null;
  foldCounts(opts.counts, anomalies);
  return { own: { ...NULL_ATTRIBUTION, carrier }, spans, points, anomalies, ambiguous };
}

/** Fold one per-transcript tally into a caller-supplied collector (no-op when none). Keeps the
 *  returned per-transcript `.anomalies` and the cross-transcript collector DISTINCT objects. */
function foldCounts(into: AnomalyCounts | undefined, from: AnomalyCounts): void {
  if (!into) return;
  for (const [cls, n] of Object.entries(from) as Array<[AnomalyClass, number]>) {
    if (n > 0) into[cls] = (into[cls] ?? 0) + n;
  }
}

/**
 * Resolve a transcript's attribution triple: the dispatch `META:` envelope for dispatched sessions,
 * then the signal-derived carrier-operand path (span-opening events; single-span-or-null), then
 * null. NEVER a wrong carrier. The `iu/<carrier>` branch fallback is DELETED (IU-1, F1): a
 * branch-only session resolves null. A `PREAMBLE: jit` block or any other echoed text is never
 * consulted (the forge-rejection).
 */
export function resolveAttribution(
  entries: TranscriptEntry[],
  meta: TranscriptMeta,
  opts: AttributeOptions = {},
): AttributionTriple {
  return attributeTranscript(entries, meta, opts).own;
}

// ── IU-A4 — parent-propagation: inherit the NEAREST carrier-bearing ancestor across a dispatch tree ─
//
// A dispatched sub-agent's OWN transcript often carries NO carrier signal of its own — no dispatch
// `META:` in its first user message, no carrier-operand tool event — yet it is doing the work of the
// carrier a work-item-bearing ancestor is bound to. This DISTINCT pass (it does NOT edit
// `attributeTranscript` / `resolveAttribution`, which resolve ONE transcript in isolation) reasons
// over the whole tree: it walks the session tree — the `parentUuid` / `isSidechain` links Claude Code
// records, agent-unwritable and so host-trust-class — UPWARD from the child to the NEAREST
// work-item-bearing ancestor (the nearest ancestor whose own attribution has a non-null carrier), and
// inherits that ancestor's resolved CARRIER IDENTITY into any descendant whose OWN carrier is null.
// A null-carrier ancestor between them is SKIPPED, not inherited — the walk keeps going up until it
// finds a real carrier or runs out of chain.
//
// Three iron rules preserve the honest-null contract:
//   • FILL-NULL-ONLY. A child's OWN valid attribution (its own dispatch META or operand signal) is
//     authoritative and is NEVER overwritten — a lens sub-agent that ran on a different carrier than
//     its parent keeps its own carrier. Inheritance only fills a child whose own carrier is null.
//   • INHERIT TRUST, NEVER MANUFACTURE IT. The inherited value is a real ancestor's OWN resolved
//     attribution. An ancestor that resolves NULL (forge-nulled by A3, or simply carrying no signal)
//     is passed over, never inherited: a child whose only ancestors all resolve null — including a
//     rootless / unlinked child — stays null. Propagation can only carry an attribution some
//     ancestor legitimately had; it never invents one.
//   • IDENTITY ONLY — `stage` NEVER INHERITS (IU-1, DR10). The envelope's stage names the CHILD
//     dispatch's own workflow stage; an ancestor's stage says nothing about an envelope-less child
//     (a lens sub-dispatch under a build parent is NOT build work). The child keeps its OWN stage —
//     null when its envelope was absent — so lens/review tokens can never contaminate a build rollup.
//
// The walk is cycle-guarded (a malformed cyclic parent graph yields honest-null, never a hang) and
// missing-parent-guarded (a link into an uncaptured transcript ends the walk — inheriting the nearest
// carrier-bearing ancestor reached before the gap, or null if none). Because `parentUuid` is
// Claude-Code-recorded, a hostile sub-agent cannot forge a link to a richer ancestor to steal its
// carrier — the tree edges are host-recorded exactly like the tool events A3 reads.

/** One session in the dispatch tree: its id, its OWN (in-isolation) attribution, and its parent
 *  session id (null for a root / rootless session). Built by the caller from the transcript corpus
 *  (resolving each `parentUuid` to its owning session); `propagateFromRoot` walks these edges.
 *  `ambiguous` marks a session whose own-null came from CONTRADICTORY signals (a rejected-boundary
 *  re-target, multiple distinct span carriers, or a conflicted resume merge) rather than absence —
 *  fill-null inheritance is REFUSED for it (an ancestor's carrier would stamp an attribution the
 *  session's own acts contradict). Defaults falsy: an absent flag is a plain no-signal null. */
export interface SessionNode {
  sessionId: string;
  own: AttributionTriple;
  parent: string | null;
  ambiguous?: boolean;
}

/** Walk a session's parent chain UPWARD and return the NEAREST strict ancestor whose OWN attribution
 *  carries a non-null carrier — the nearest-non-null propagation source. An ancestor whose own carrier
 *  is null (a non-carrier session, or one IU-A3 forge-rejected) is SKIPPED, and the walk continues up.
 *  Returns null when no carrier-bearing ancestor is reachable up the chain (a rootless child, a chain of
 *  only null-carrier ancestors, or a walk that ends at a missing/cyclic edge before any carrier).
 *  Cycle-guarded — a revisited session means a malformed cycle, so the walk ends (fail-closed →
 *  honest-null). Missing-parent-guarded — a parent id absent from the map ends the walk rather than
 *  dereferencing a link into an uncaptured transcript. `start` itself is never returned (a strict
 *  ancestor only); the caller has already established the child's own carrier is null. */
function nearestCarrierAncestor(start: SessionNode, bySession: Map<string, SessionNode>): SessionNode | null {
  const visited = new Set<string>([start.sessionId]);
  let cur: SessionNode = start;
  for (;;) {
    if (cur.parent === null) return null; // reached a root with no carrier anywhere up the chain
    const next = bySession.get(cur.parent);
    if (!next) return null; // parent not captured → no reachable carrier-bearing ancestor
    if (visited.has(next.sessionId)) return null; // cycle → fail-closed (no clean source → honest-null)
    visited.add(next.sessionId);
    if (next.own.carrier !== null) return next; // the NEAREST carrier-bearing ancestor — the source
    cur = next; // a null-carrier ancestor is skipped; keep walking up
  }
}

/** Resolve every session's FINAL attribution by inheriting the NEAREST carrier-bearing ancestor's
 *  CARRIER IDENTITY (carrier / carrier_kind / arc / iu / harness_id) into any descendant whose OWN
 *  carrier is null (fill-null-only; trust inherited, never manufactured). `stage` is NEVER inherited
 *  — the child keeps its own (IU-1, DR10). Returns a sessionId → AttributionTriple map: a session
 *  with its own carrier maps to its own; a null-carrier descendant inherits the identity of the
 *  nearest ancestor whose own carrier is non-null, walking up and SKIPPING any null-carrier ancestor
 *  between them; a rootless, cyclic, or all-null-ancestor descendant keeps its own (null)
 *  attribution unchanged. Pure — same nodes in ⇒ an equal map out (order-independent). */
export function propagateFromRoot(nodes: SessionNode[]): Map<string, AttributionTriple> {
  const bySession = new Map<string, SessionNode>();
  for (const n of nodes) bySession.set(n.sessionId, n);

  const out = new Map<string, AttributionTriple>();
  for (const n of nodes) {
    // A child's OWN valid attribution wins — never overwritten (the fill-null-only precedence).
    if (n.own.carrier !== null) {
      out.set(n.sessionId, { ...n.own });
      continue;
    }
    // An AMBIGUOUS own-null (contradictory signals — a rejected-boundary re-target, distinct span
    // carriers, or a conflicted resume) is NEVER back-filled: inheriting an ancestor's carrier
    // would stamp an attribution this session's own acts contradict — the exact wrong-half class
    // the honest-null exists to prevent. Ambiguity is not absence.
    if (n.ambiguous) {
      out.set(n.sessionId, { ...n.own });
      continue;
    }
    // Own carrier is null → inherit the NEAREST carrier-bearing ancestor's carrier IDENTITY. The walk
    // itself guarantees the source is a DISTINCT ancestor with a non-null carrier (a null-carrier
    // ancestor is skipped, not inherited); it returns null for a rootless child, a cycle, or a chain
    // of only null-carrier ancestors, all of which leave the child null — trust is never manufactured.
    // `stage` stays the CHILD's own (never inherited — identity only, IU-1/DR10).
    const source = nearestCarrierAncestor(n, bySession);
    if (source) {
      out.set(n.sessionId, { ...source.own, stage: n.own.stage });
    } else {
      out.set(n.sessionId, { ...n.own });
    }
  }
  return out;
}
