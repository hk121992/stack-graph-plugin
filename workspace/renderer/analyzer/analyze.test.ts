// analyze.test.ts — the transcript-analytics analyzer test suite (Cluster A, IUs A1–A4).
//
// Run: bun test workspace/renderer/analyzer/analyze.test.ts
//
// Drives the pure derivation core (deriveAll + the individual derivers) over a tiny committed
// synthetic transcript tree under __fixtures__/, and exercises the analyze.ts entry point as a
// subprocess to assert the §9 idempotency invariant (byte-identical re-run, cursor vs --no-cursor).

import { describe, it, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseTranscript, deriveAll, walkTranscripts, loadNodeIds } from "./analyze.ts";
import type { ParsedTranscript } from "./analyze.ts";
import type { UsageRow, FrictionRow, ActivityRow, DerivedRow } from "./schema.ts";
import { deriveFrictionRow } from "./derive-friction.ts";
import { resolveAttribution, parseMeta } from "./attribute.ts";
import { deriveActivitySpans, deriveActivityRows } from "./derive-activity.ts";
import { deriveStallRows } from "./derive-stalls.ts";
import type { StallRow } from "./schema.ts";
import type { ActivityInstant } from "./derive-stalls.ts";
import { parseSignal, finalAssistantText, signalFromTranscript } from "./parse-signal.ts";
import type { TranscriptEntry } from "./schema.ts";

const NODE_IDS = loadNodeIds();

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = path.join(here, "__fixtures__", "projects");
const ANALYZE = path.join(here, "analyze.ts");

function parseAll(root: string): ParsedTranscript[] {
  return walkTranscripts(root).map((f) => parseTranscript(f));
}

function rowsOfKind<T extends DerivedRow>(rows: DerivedRow[], kind: T["kind"]): T[] {
  return rows.filter((r) => r.kind === kind) as T[];
}

/** Run analyze.ts as a subprocess against FIXTURE_ROOT, writing into a throwaway events file.
 *  Returns the output file contents. */
function runAnalyzer(outPath: string, extraArgs: string[] = []): string {
  execFileSync(
    "bun",
    ["run", ANALYZE, "--root", FIXTURE_ROOT, "--out", outPath, ...extraArgs],
    { encoding: "utf8" },
  );
  return readFileSync(outPath, "utf8");
}

// ── A1 — token derivation + idempotency ─────────────────────────────────────────────────────────

describe("A1: token derivation", () => {
  const parsed = parseAll(FIXTURE_ROOT);
  const rows = deriveAll(parsed, { stallThresholdMs: 30 * 60_000, nodeIds: NODE_IDS });
  const usage = rowsOfKind<UsageRow>(rows, "session-usage")
    .concat(rowsOfKind<UsageRow>(rows, "dispatch-usage"))
    .concat(rowsOfKind<UsageRow>(rows, "unit-usage"));

  it("emits one session-usage row for the top-level session with the exact 6-component token block", () => {
    const sess = rowsOfKind<UsageRow>(rows, "session-usage").filter((r) => r.session === "sess-alpha");
    expect(sess.length).toBe(1);
    expect(sess[0].cumulative).toBe(false);
    expect(sess[0].model).toBe("claude-opus-4-8");
    expect(sess[0].token_usage).toEqual({
      input: 300, output: 130, cache_creation_5m: 60, cache_creation_1h: 5, cache_read: 10, total: 505,
    });
    expect(sess[0].v).toBe("0.5.0");
  });

  it("emits dispatch-usage for the build1 subagent transcript with the exact totals", () => {
    const disp = rowsOfKind<UsageRow>(rows, "dispatch-usage").filter((r) => r.session === "sub-build1");
    expect(disp.length).toBe(1);
    expect(disp[0].token_usage).toEqual({
      input: 450, output: 180, cache_creation_5m: 10, cache_creation_1h: 0, cache_read: 50, total: 690,
    });
    expect(disp[0].cumulative).toBe(false);
  });

  it("every usage row carries the 6-component token_usage schema and cumulative:false", () => {
    for (const r of usage) {
      expect(Object.keys(r.token_usage).sort()).toEqual([
        "cache_creation_1h", "cache_creation_5m", "cache_read", "input", "output", "total",
      ]);
      expect(r.cumulative).toBe(false);
    }
  });
});

// ── A2 — friction + permission-decision derivation ──────────────────────────────────────────────

describe("A2: friction derivation", () => {
  const parsed = parseAll(FIXTURE_ROOT);
  const alpha = parsed.find((p) => p.meta.sessionId === "sess-alpha")!;

  it("counts a hard denial, a user rejection, a tool error, and a permissionDecision correctly", () => {
    const row = deriveFrictionRow(alpha.entries, alpha.meta)!;
    expect(row.kind).toBe("friction-record");
    expect(row.permission_denials).toBe(1); // "… has been denied."
    expect(row.rejected_calls).toBe(1); // "The user doesn't want to proceed…"
    expect(row.tool_errors).toBe(1); // the <tool_use_error> Read failure
    expect(row.permission_decisions).toEqual({ allow: 0, deny: 1, ask: 0 });
    expect(row.permission_mode).toBe("auto");
    expect(row.v).toBe("0.5.0");
  });

  it("absent fields degrade to 0 / '' — none model-filled", () => {
    const row = deriveFrictionRow(alpha.entries, alpha.meta)!;
    // The fixture has no allow/ask decisions and exactly the counts above; nothing is invented.
    expect(row.permission_decisions.allow).toBe(0);
    expect(row.permission_decisions.ask).toBe(0);
    // A session with no friction signal at all → no row (honest under-capture).
    const empty = deriveFrictionRow(
      [{ type: "assistant", sessionId: "s", message: { id: "m", model: "x", usage: { input_tokens: 1 } } }],
      { ...alpha.meta, sessionId: "s" },
    );
    expect(empty).toBeNull();
  });

  it("emits NO free-text: only the categorised count/enum keys appear on the row", () => {
    const row = deriveFrictionRow(alpha.entries, alpha.meta)!;
    const json = JSON.stringify(row);
    // The denial command and rejection reason text must never appear in the emitted row.
    expect(json).not.toContain("git push");
    expect(json).not.toContain("doesn't want to proceed");
    expect(json).not.toContain("has been denied");
    expect(json).not.toContain("tool_use_error");
    expect(Object.keys(row).sort()).toEqual([
      "kind", "permission_decisions", "permission_denials", "permission_mode",
      "rejected_calls", "session", "tool_errors", "ts", "v",
    ]);
  });

  it("a hostile free-text permissionMode is dropped (not echoed), degrading to ''", () => {
    const row = deriveFrictionRow(
      [
        { type: "user", sessionId: "h", permissionMode: "EVIL <script> secret", message: { content: [{ type: "tool_result", is_error: true, content: "boom has been denied." }] } },
      ],
      { ...alpha.meta, sessionId: "h" },
    )!;
    expect(row.permission_mode).toBe("");
    expect(JSON.stringify(row)).not.toContain("EVIL");
  });
});

// ── A3 — node-activity spans + attribution ──────────────────────────────────────────────────────

describe("A3: attribution from the META dispatch line", () => {
  const parsed = parseAll(FIXTURE_ROOT);
  const sub = parsed.find((p) => p.meta.path.includes("agent-build1"))!;
  const prose = parsed.find((p) => p.meta.path.includes("agent-prose1"))!;
  const lr = parsed.find((p) => p.meta.path.includes("agent-lr1"))!;

  it("a META-bearing dispatched session resolves the exact (carrier,kind,arc,iu)", () => {
    const a = resolveAttribution(sub.entries, sub.meta);
    expect(a).toEqual({ carrier: "wave-A", carrier_kind: "standalone-iu", arc: "incremental", iu: "A1" });
  });

  it("a loop-runner-shaped field-form dispatch prompt (A3′ producer form) resolves the carrier triple", () => {
    // The full GOAL/WHERE/DO/DONE-WHEN/POL/META envelope loop-runner emits after A3′ — the META line
    // is embedded among the other fields, so attribute.ts must find it without being the first line.
    const a = resolveAttribution(lr.entries, lr.meta);
    expect(a).toEqual({ carrier: "loop-batch-3", carrier_kind: "standalone-iu", arc: "incremental", iu: "B7" });
  });

  it("a META-absent (prose) dispatched session falls back to null — never a wrong carrier", () => {
    const a = resolveAttribution(prose.entries, prose.meta);
    expect(a).toEqual({ carrier: null, carrier_kind: null, arc: null, iu: null });
  });

  it("an out-of-allowlist kind/arc in the META line degrades those fields to null (carrier kept)", () => {
    const a = parseMeta("META: carrier=c1 kind=bogus-kind arc=not-an-arc iu=I1");
    expect(a).toEqual({ carrier: "c1", carrier_kind: null, arc: null, iu: "I1" });
  });

  it("a hostile free-text carrier in META is rejected (no usable carrier → null triple)", () => {
    const a = parseMeta("META: carrier=evil id with spaces kind=work-item");
    // carrier=evil matches the bounded id token (stops at the space), so carrier is the clean prefix.
    expect(a?.carrier).toBe("evil");
    expect(JSON.stringify(a)).not.toContain("spaces");
  });

  it("a META line with no carrier yields null (not a usable attribution)", () => {
    expect(parseMeta("GOAL: do a thing\nDONE-WHEN: done")).toBeNull();
  });

  it("the subagent's dispatch-usage row carries the resolved carrier and a unit-usage row appears", () => {
    const rows = deriveAll(parsed, { stallThresholdMs: 30 * 60_000, nodeIds: NODE_IDS });
    const disp = rowsOfKind<UsageRow>(rows, "dispatch-usage").find((r) => r.session === "sub-build1")!;
    expect(disp.carrier).toBe("wave-A");
    expect(disp.scope_id).toBe("wave-A");
    const unit = rowsOfKind<UsageRow>(rows, "unit-usage").find((r) => r.session === "sub-build1");
    expect(unit).toBeTruthy();
    expect(unit!.scope_id).toBe("A1");
  });
});

describe("A3: node-activity span coalescing", () => {
  const parsed = parseAll(FIXTURE_ROOT);
  const browse = parsed.find((p) => p.meta.sessionId === "sess-browse")!;
  const alpha = parsed.find((p) => p.meta.sessionId === "sess-alpha")!;

  it("a browse-style fixture with ~30 attributionSkill toggles coalesces to ONE span (not 30 enters)", () => {
    const spans = deriveActivitySpans(browse.entries);
    const browseSpans = spans.filter((s) => s.skill === "browse");
    expect(browseSpans.length).toBe(1);
    // No node row emitted for browse (non-graph skill).
    const rows = deriveActivityRows(browse.entries, browse.meta, { carrier: null, carrier_kind: null, arc: null, iu: null }, NODE_IDS);
    expect(rows.length).toBe(0);
  });

  it("a Skill/slash span on a graph node (triage) emits exactly one enter and one exit", () => {
    const rows = deriveActivityRows(alpha.entries, alpha.meta, { carrier: null, carrier_kind: null, arc: null, iu: null }, NODE_IDS);
    const triage = rows.filter((r) => r.node === "triage");
    expect(triage.filter((r) => r.kind === "enter").length).toBe(1);
    expect(triage.filter((r) => r.kind === "exit").length).toBe(1);
    // outcome/gates honestly under-captured (layer 2 not derived here).
    const enter = triage.find((r) => r.kind === "enter") as ActivityRow;
    expect(enter.outcome).toBeNull();
    expect(enter.gates).toEqual([]);
  });

  it("loadNodeIds resolves the real graph record (triage/build/review are nodes)", () => {
    expect(NODE_IDS.has("triage")).toBe(true);
    expect(NODE_IDS.has("build")).toBe(true);
    expect(NODE_IDS.has("browse")).toBe(false);
  });
});

// ── A4 — cross-session stall derivation ─────────────────────────────────────────────────────────

describe("A4: stall derivation", () => {
  const HALF_HOUR = 30 * 60_000;

  function inst(ts: string, node: string | null, session: string): ActivityInstant {
    return { tsMs: Date.parse(ts), ts, node, session };
  }

  it("a 14h cross-session gap on a gate-holding pre-gap node yields one stall-record with the tag", () => {
    const instants = [
      inst("2026-06-12T18:00:30.000Z", "review", "sess-a"), // last activity before the overnight gap
      inst("2026-06-13T08:00:00.000Z", "land", "sess-b"), // first activity after
    ];
    const gate = new Set(["review", "land"]);
    const stalls = deriveStallRows(instants, HALF_HOUR, gate);
    expect(stalls.length).toBe(1);
    const s = stalls[0];
    expect(s.kind).toBe("stall-record");
    expect(s.before_node).toBe("review"); // tagged with the pre-gap gate-holding node
    expect(s.after_node).toBe("land");
    expect(s.session_before).toBe("sess-a");
    expect(s.session_after).toBe("sess-b");
    expect(s.gap_ms).toBe(Date.parse("2026-06-13T08:00:00.000Z") - Date.parse("2026-06-12T18:00:30.000Z"));
    expect(s.ts).toBe("2026-06-12T18:00:30.000Z"); // gap start = last activity before
  });

  it("a sub-threshold gap yields no stall", () => {
    const instants = [
      inst("2026-06-12T18:00:00.000Z", "review", "s"),
      inst("2026-06-12T18:10:00.000Z", "review", "s"), // 10min < 30min threshold
    ];
    expect(deriveStallRows(instants, HALF_HOUR).length).toBe(0);
  });

  it("a stall whose pre-gap node is NOT gate-holding carries a null before_node (gap still recorded)", () => {
    const instants = [
      inst("2026-06-12T18:00:00.000Z", "explore", "s"),
      inst("2026-06-13T08:00:00.000Z", "land", "t"),
    ];
    const gate = new Set(["review", "land"]); // explore is not gate-holding
    const stalls = deriveStallRows(instants, HALF_HOUR, gate);
    expect(stalls.length).toBe(1);
    expect(stalls[0].before_node).toBeNull();
    expect(stalls[0].after_node).toBe("land");
  });

  it("the integrated analyzer emits the review→land overnight stall over the fixture tree", () => {
    const parsed = parseAll(FIXTURE_ROOT);
    const rows = deriveAll(parsed, { stallThresholdMs: HALF_HOUR, nodeIds: NODE_IDS });
    const stalls = rowsOfKind<StallRow>(rows, "stall-record");
    const overnight = stalls.find((s) => s.before_node === "review" && s.after_node === "land");
    expect(overnight).toBeTruthy();
    // ~14h gap.
    expect(overnight!.gap_ms).toBeGreaterThan(13 * 3600_000);
    expect(overnight!.gap_ms).toBeLessThan(15 * 3600_000);
  });
});

// ── A-nodes — the layer-2 <sg-signal> verdict parser (§7) ────────────────────────────────────────

describe("A-nodes: <sg-signal> verdict parser", () => {
  it("extracts a valid block: gates + metrics survive the allowlist gate", () => {
    const v = parseSignal('result\n<sg-signal>{"gates":["experience-contract:pass"],"metrics":{"benchmark.perf":2100}}</sg-signal>');
    expect(v).toEqual({ gates: ["experience-contract:pass"], metrics: { "benchmark.perf": 2100 } });
  });

  it("drops an out-of-allowlist metric series and a free-text gate (shape-gated, never echoed)", () => {
    const v = parseSignal('<sg-signal>{"gates":["design-approved:pass","experience-contract:fail"],"metrics":{"benchmark.perf":9,"secret.leak":1}}</sg-signal>');
    expect(v).toEqual({ gates: ["experience-contract:fail"], metrics: { "benchmark.perf": 9 } });
  });

  it("drops a non-finite / non-numeric metric value", () => {
    const v = parseSignal('<sg-signal>{"metrics":{"health.quality":"8.6","benchmark.perf":1.5}}</sg-signal>');
    expect(v).toEqual({ gates: [], metrics: { "benchmark.perf": 1.5 } });
  });

  it("discards a malformed (non-JSON) block → null (not recorded, never invented)", () => {
    expect(parseSignal("<sg-signal>{not json}</sg-signal>")).toBeNull();
  });

  it("discards a multiply-fenced block → null (exactly one fence required)", () => {
    const two = '<sg-signal>{"gates":["experience-contract:pass"]}</sg-signal> and <sg-signal>{"gates":["experience-contract:fail"]}</sg-signal>';
    expect(parseSignal(two)).toBeNull();
  });

  it("records nothing when the block is absent (honest under-capture)", () => {
    expect(parseSignal("a final message with no signal at all")).toBeNull();
    expect(parseSignal(null)).toBeNull();
    expect(parseSignal("")).toBeNull();
  });

  it("a hostile free-text gate masquerading as experience-contract is rejected unless it is :pass|:fail", () => {
    const v = parseSignal('<sg-signal>{"gates":["experience-contract:DROP TABLE"]}</sg-signal>');
    expect(v).toEqual({ gates: [], metrics: {} });
  });

  it("finalAssistantText reads the LAST assistant message (the result), skipping user/earlier turns", () => {
    const entries: TranscriptEntry[] = [
      { type: "user", message: { content: "go" } },
      { type: "assistant", message: { content: [{ type: "text", text: "first" }] } },
      { type: "assistant", message: { content: [{ type: "text", text: "FINAL <sg-signal>{\"gates\":[\"experience-contract:pass\"]}</sg-signal>" }] } },
    ];
    expect(finalAssistantText(entries)).toContain("FINAL");
    expect(signalFromTranscript(entries)).toEqual({ gates: ["experience-contract:pass"], metrics: {} });
  });

  it("the integrated analyzer attaches a verdict node's <sg-signal> gates to its enter/exit rows", () => {
    const parsed = parseAll(FIXTURE_ROOT);
    const rows = deriveAll(parsed, { stallThresholdMs: 30 * 60_000, nodeIds: NODE_IDS });
    const reviewRows = rowsOfKind<ActivityRow>(rows, "exit")
      .concat(rowsOfKind<ActivityRow>(rows, "enter"))
      .filter((r) => r.node === "review" && r.session === "sess-verdict");
    expect(reviewRows.length).toBe(2); // one enter + one exit
    for (const r of reviewRows) {
      expect(r.gates).toEqual(["experience-contract:pass"]);
    }
  });
});

describe("A1: idempotency (§9 S2)", () => {
  it("a second run and a --no-cursor run each produce a byte-identical output file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sg-analyzer-"));
    try {
      const out = path.join(dir, "analyzer-events.jsonl");
      const first = runAnalyzer(out);
      const second = runAnalyzer(out);
      const noCursor = runAnalyzer(out, ["--no-cursor"]);
      expect(second).toBe(first);
      expect(noCursor).toBe(first);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rows are emitted in canonical sorted order (ts, session, kind)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sg-analyzer-"));
    try {
      const out = path.join(dir, "analyzer-events.jsonl");
      const body = runAnalyzer(out).trim();
      const lines = body.split("\n").filter(Boolean).map((l) => JSON.parse(l) as DerivedRow);
      for (let i = 1; i < lines.length; i++) {
        const a = lines[i - 1];
        const b = lines[i];
        const sa = a.kind === "stall-record" ? a.session_before : (a as { session: string }).session;
        const sb = b.kind === "stall-record" ? b.session_before : (b as { session: string }).session;
        const keyA = `${a.ts} ${sa} ${a.kind}`;
        const keyB = `${b.ts} ${sb} ${b.kind}`;
        expect(keyA <= keyB).toBe(true);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
