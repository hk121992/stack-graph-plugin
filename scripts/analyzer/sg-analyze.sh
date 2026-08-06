#!/usr/bin/env bash
# sg-analyze.sh — the vendored, self-LOCATING analyzer wrapper a consuming harness runs from its
# scheduler (cron). It is the entry point IU-4's harness-init MATERIALIZES with resolved absolute
# paths at scaffold time; this factory source carries an unmaterialized placeholder in its place.
#
# CONTRACT (the property that matters — behaviour under the REAL cron env):
#   * The analyzer is resolved via a BAKED ABSOLUTE PATH (the @@ANALYZER_HOME@@ placeholder below,
#     which harness-init substitutes with the resolved `<plugin>/scripts/analyzer` — cf. IU-4). The
#     wrapper NEVER self-locates (no `$BASH_SOURCE`/`dirname` walk): a scheduler may invoke it by an
#     absolute path from any cwd, and a copy that reasoned from its own location would resolve the
#     analyzer wrong. Resolution is by the baked path, full stop.
#   * The org-root output is resolved from SG_EVENT_LOG (an ABSOLUTE file path), never self-location.
#   * It FAILS CLOSED under the cron env — an absent (or relative) SG_EVENT_LOG, or an unresolved
#     analyzer home, is a NON-ZERO exit with a remedy on stderr. There is NO silent no-op and NO
#     fallback exec against a guessed path: a broken scheduler install fails LOUD, it does not quietly
#     stop producing analytics (the failure the org-root self-locating wrapper hid — it defaulted
#     every path from its own dir and ran regardless, so a mis-install looked healthy).
#
# ENV (all optional overrides; the materialized wrapper needs none of them once baked):
#   SG_EVENT_LOG       REQUIRED. Absolute path to the derived event log (the analyzer's --out).
#   SG_ANALYZER_HOME   Override the baked analyzer home (used by the cron-fidelity test + a re-point).
#   SG_TRANSCRIPT_ROOT The analyzer's input root (default ~/.claude/projects; passed through as --root).
#   SG_ANALYZE_LOG     Where a non-interactive (cron) run appends its log (default beside SG_EVENT_LOG).
set -euo pipefail

# Cron runs with a minimal environment — establish a sane PATH and locate bun.
export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"

remedy() {
  # A remedy string on stderr — fail-closed's whole point is that the operator learns the fix.
  echo "sg-analyze: $1" >&2
}

# ── Resolve the output (SG_EVENT_LOG — absolute; NEVER self-location) ────────────────────────────
# The primary fail-closed contract: fail on absence (the cron case: the scheduler forgot to export
# it) and on a RELATIVE path (cron's cwd is `/`, so a relative --out would silently write under `/` —
# a mis-write, not a run). Checked FIRST because it is the headline the IU guards: the analyzer's
# output location comes from the environment, never from the wrapper's own location.
if [ -z "${SG_EVENT_LOG:-}" ]; then
  remedy "SG_EVENT_LOG is not set — the analyzer's output path is unknown; export SG_EVENT_LOG=<abs path to .stack-graph/derived/analyzer-events.jsonl> (harness-init writes it into .claude/settings.json). Refusing to run (no fallback path)."
  exit 2
fi
case "$SG_EVENT_LOG" in
  /*) : ;; # absolute — good
  *)
    remedy "SG_EVENT_LOG='$SG_EVENT_LOG' is not absolute — a relative path under cron's cwd ('/') would mis-write; set SG_EVENT_LOG to an absolute path. Refusing to run."
    exit 2
    ;;
esac

# ── Resolve the analyzer home (baked absolute path; NEVER self-location) ─────────────────────────
# The placeholder is substituted by harness-init at materialize time (IU-4). Until then it is the
# literal sentinel; SG_ANALYZER_HOME overrides it (a re-point, or the cron-fidelity test). An
# unresolved home (still the placeholder, or a path that does not exist) FAILS CLOSED — the wrapper
# never guesses a location and never runs a fallback.
BAKED_ANALYZER_HOME='@@ANALYZER_HOME@@'
ANALYZER_HOME="${SG_ANALYZER_HOME:-$BAKED_ANALYZER_HOME}"

case "$ANALYZER_HOME" in
  *@@ANALYZER_HOME@@*)
    remedy "analyzer home is unmaterialized (the @@ANALYZER_HOME@@ placeholder was never substituted) — re-run harness-init/harness-update to materialize the wrapper, or set SG_ANALYZER_HOME to <plugin>/scripts/analyzer"
    exit 3
    ;;
esac
if [ ! -f "$ANALYZER_HOME/analyze.ts" ]; then
  remedy "analyzer not found at '$ANALYZER_HOME/analyze.ts' — the baked analyzer home does not resolve; re-run harness-update to re-materialize the analyzer, or set SG_ANALYZER_HOME to <plugin>/scripts/analyzer"
  exit 3
fi

BUN="$(command -v bun || true)"
[ -n "$BUN" ] || { remedy "bun not found on PATH"; exit 127; }

# The transcript input root (analyzer's --root); default matches the harness binding. `$HOME` is
# guarded with `${HOME:-}` because the cron env (`env -i`) exports no HOME — under `set -u` a bare
# `$HOME` would abort; the harness materializes SG_TRANSCRIPT_ROOT into the env so the default is a
# last resort, not the norm.
TRANSCRIPT_ROOT="${SG_TRANSCRIPT_ROOT:-${HOME:-}/.claude/projects}"
LOG="${SG_ANALYZE_LOG:-$(dirname "$SG_EVENT_LOG")/analyze.log}"

mkdir -p "$(dirname "$SG_EVENT_LOG")"
# Non-interactive (cron) runs append to the log; an interactive run prints to the terminal.
[ -t 1 ] || exec >>"$LOG" 2>&1

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] sg-analyze: $*"; }

log "start (analyzer=$ANALYZER_HOME, transcripts=$TRANSCRIPT_ROOT, out=$SG_EVENT_LOG)"
SG_TRANSCRIPT_ROOT="$TRANSCRIPT_ROOT" "$BUN" run "$ANALYZER_HOME/analyze.ts" \
  --root "$TRANSCRIPT_ROOT" --out "$SG_EVENT_LOG"
log "done (events=$SG_EVENT_LOG)"
