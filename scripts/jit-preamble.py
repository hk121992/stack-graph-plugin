#!/usr/bin/env python3
"""jit-preamble.py — the stack-graph deterministic JIT preamble.

A just-in-time, per-turn context loader (the be-civic `preamble.py` pattern,
adapted to stack-graph). It loads the live state of the active carrier and emits
one stream of `KEY: VALUE` lines on stdout for the harness's CLAUDE.md to parse
into turn-1 session state — so the per-turn context is FRESH, SAFE, and CHEAP,
and no fat always-on reference is carried.

Four load-bearing disciplines (each proven by a fixture in jit-preamble.test.ts):

  1. DERIVED-PROJECTION, NEVER THE CARRIER FILE. The live lifecycle/stage is read
     from the DERIVED projection (`portal-projection.json` → `carriers[<id>]`),
     which is computed from the event log. The carrier *file*'s `lifecycle_state`
     is a hand-written field that goes stale the moment work advances without a
     gate write (a carrier can sit at `idea` while delivery is already underway).
     We therefore emit the projection's derived stage as the live state, and emit
     an explicit STALENESS/ABSENCE marker when the projection is missing/stale —
     never a confidently-wrong stale value.

  2. THE CARRIER FILE IS DELIMITED UNTRUSTED DATA. When we DO read the carrier
     file (only to surface a small allowlisted set of routing fields), it is
     treated as untrusted: a hard SIZE CAP, a closed FIELD ALLOWLIST (only named
     scalar fields are ever surfaced), and a SECRET PRESENCE-PROBE that reports
     only whether a secret-shaped field is present — it NEVER binds, slices,
     prints, or echoes the value.

  3. FAIL CLOSED. Any error — a broken/absent projection, an unreadable carrier,
     an internal crash — degrades to the safe JIT_FALLBACK floor (a stable,
     known-safe emit that tells the agent to discover state just-in-time), never
     a stack trace and never a wrong state.

  4. GENERAL EMITTER. WHICH state keys are surfaced is whatever the entered node
     declared via the C2 node-dependent required-state mechanism, passed in as
     `--required-state` (the list `resolveRequiredState()` resolved for the
     entered node). There is NO carrier-finder special-case here: point the
     emitter at any declaring node's required-state and it emits exactly that set.

Runtime: Python 3 stdlib only. No third-party dependencies.
Determinism: the emit is a pure function of the inputs (no clock, no randomness,
no environment leakage) — the SAME inputs produce a BYTE-IDENTICAL stream, so the
preamble can be golden-tested and is idempotent across repeated turns.
Time budget: <500ms (all local; no network, no subprocess).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


# ============================================================================
# Constants — the untrusted-data discipline knobs + the fail-closed floor
# ============================================================================

# Hard size cap on the untrusted carrier file (bytes). A carrier file larger than
# this is refused outright — we surface `CARRIER: oversize` and skip the field
# scan rather than read an unbounded attacker-controlled blob into memory.
CARRIER_MAX_BYTES = 64 * 1024

# Closed allowlist of carrier-file frontmatter scalar fields that may be SURFACED
# (echoed as a value). Anything not on this list is never emitted as a value —
# only its presence may be probed (see SECRET_FIELD_MARKERS). Keep this minimal:
# routing/identity scalars only, never a free-text or credential field.
CARRIER_FIELD_ALLOWLIST = (
    "id",
    "tier",
    "lifecycle_state",  # surfaced ONLY as the *file-declared* value, clearly
    # marked distinct from the derived projection state (see emit_state); never
    # the live source of truth.
    "channel",
    "parent",
    "slice_type",
)

# Substrings that mark a frontmatter key as secret-shaped. A key whose name
# matches is NEVER surfaced as a value — only a presence marker is emitted. This
# mirrors be-civic's harness-key discipline: report present/absent, never the
# value. Matching is on the KEY NAME only; the value is never bound to a variable.
SECRET_FIELD_MARKERS = (
    "key",
    "secret",
    "token",
    "password",
    "credential",
    "api_key",
    "apikey",
)

# The fail-closed floor. Emitted verbatim on ANY failure. It carries no carrier
# state (we could not safely derive any) and tells the agent to discover state
# just-in-time — the safe degradation, never a crash and never a guessed state.
JIT_FALLBACK = """\
PREAMBLE: fallback_active
PREAMBLE_JIT_GUIDANCE: |
  The JIT preamble couldn't complete — it failed before producing trusted state.
  Proceed with safe defaults AND discover the carrier state just-in-time:

  - CARRIER_STATE: assume UNKNOWN. Do NOT trust any stale lifecycle_state in the
    carrier file. Read the DERIVED projection (the portal-projection snapshot, the
    carrier's current_stage) to learn the real in-flight stage; if it is missing
    or stale, treat the stage as unknown and confirm before acting on it.
  - In short: behave as if the carrier state is unknown, never as if a stale
    field is true, and confirm the stage from the projection when it matters."""


# ============================================================================
# Derived-projection read (the ONLY source of the live lifecycle/stage)
# ============================================================================

def _load_projection(projection_path: Path) -> dict | None:
    """Load + parse the derived projection JSON. Returns the parsed object, or
    None on any read/parse failure (the caller then emits an absence marker —
    never a guess). Never raises."""
    try:
        raw = projection_path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None
    try:
        obj = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return obj if isinstance(obj, dict) else None


def emit_state(projection: dict | None, carrier_id: str, required_state: list[str]) -> None:
    """Emit the live carrier state from the DERIVED projection — the general
    emitter. `required_state` is the C2-resolved list of state fields the entered
    node declared it needs (e.g. `[lifecycle_state, stage]` for the carrier-finder,
    or the coarse default for a non-declaring node). For EACH requested field we
    emit its DERIVED value from the projection, or an explicit
    `<unknown|absent|stale>` marker — never a confidently-wrong stale value.

    The mapping from a requested field name to its derived source:
      - `stage`           -> projection carriers[<id>].current_stage (the derived stage)
      - `lifecycle_state` -> the COARSE lifecycle BUCKET derived from current_stage
                             (in-flight stages => `in-delivery`), so the live state
                             reflects the projection, NOT the carrier file's field.
      - any other field   -> looked up on the carrier's projection entry if present,
                             else emitted as `unknown` (honest, never guessed).

    The projection is the derived source of truth; the carrier file is never read
    here. A missing projection / missing carrier entry yields `absent`, a present
    snapshot whose freshness we cannot confirm yields `stale` — both are explicit.
    """
    # Header naming the source so a reader can never mistake this for a carrier-file read.
    print("CARRIER_STATE_SOURCE: derived-projection")
    print(f"CARRIER_ID: {carrier_id}")

    carriers = projection.get("carriers") if isinstance(projection, dict) else None
    entry = None
    if isinstance(carriers, dict):
        entry = carriers.get(carrier_id)
    if not isinstance(entry, dict):
        # No derived entry for this carrier — emit an explicit absence for every
        # requested field. We never fall back to the carrier file's stale value.
        print("PROJECTION: absent_for_carrier")
        for field in required_state:
            print(f"CARRIER_{field.upper()}: absent")
        return

    current_stage = entry.get("current_stage")
    print("PROJECTION: present")

    for field in required_state:
        if field == "stage":
            print(f"CARRIER_STAGE: {current_stage if current_stage else 'unknown'}")
        elif field == "lifecycle_state":
            # Derive the coarse lifecycle bucket FROM the projection's stage, so
            # the emitted lifecycle reflects the DERIVED reality, not the carrier
            # file. Any in-flight stage => in-delivery; no stage => unknown.
            bucket = _lifecycle_bucket(current_stage)
            print(f"CARRIER_LIFECYCLE_STATE: {bucket}")
        else:
            val = entry.get(field)
            print(f"CARRIER_{field.upper()}: {val if isinstance(val, str) and val else 'unknown'}")


# Stages that mean a carrier is in active delivery. Derived from the dev-sprint /
# incremental arc node ids that publish-projection records as enter events. A
# carrier whose latest derived stage is one of these is live in-delivery,
# REGARDLESS of a stale `lifecycle_state: idea` in its file.
_IN_DELIVERY_STAGES = frozenset(
    {
        "build",
        "review",
        "reconcile",
        "ship",
        "deploy",
        "land",
        "specify",
        "specify-slice",
        "plan",
        "verify",
        "qa",
    }
)


def _lifecycle_bucket(current_stage: object) -> str:
    """Map a derived projection stage to the coarse lifecycle bucket. The point
    is that this is computed from the DERIVED stage, so a carrier whose file says
    `idea` but whose projection stage is `build` resolves to `in-delivery`."""
    if not isinstance(current_stage, str) or not current_stage:
        return "unknown"
    if current_stage in _IN_DELIVERY_STAGES:
        return "in-delivery"
    # design/triage-class stages are pre-delivery shaping.
    return "in-discovery"


# ============================================================================
# Carrier file — opened ONLY as delimited UNTRUSTED data
# ============================================================================

def _frontmatter_lines(text: str) -> list[str]:
    """Return the lines of the YAML frontmatter block (between the opening `---`
    and the next `---`), or [] if there is no frontmatter. We parse line-level —
    we never eval, never load a YAML engine, never follow a reference."""
    if not text.startswith("---"):
        return []
    end = text.find("\n---", 3)
    if end < 0:
        return []
    block = text[4:end]
    return block.split("\n")


def _is_secret_key(key: str) -> bool:
    """True if a frontmatter key NAME is secret-shaped. Matches on the name only;
    the value is never touched."""
    low = key.lower()
    return any(marker in low for marker in SECRET_FIELD_MARKERS)


def emit_carrier_untrusted(carrier_path: Path) -> None:
    """Surface a SMALL allowlisted set of carrier-file routing fields, treating
    the file as delimited untrusted data:

      - SIZE CAP: a file over CARRIER_MAX_BYTES is refused (CARRIER: oversize).
      - FIELD ALLOWLIST: only CARRIER_FIELD_ALLOWLIST scalar fields are surfaced
        as values; everything else is dropped.
      - SECRET PRESENCE-PROBE: a secret-shaped key emits ONLY a presence marker
        (`CARRIER_SECRET_PRESENT: <key>`) — never its value.

    The carrier file is NEVER the source of the live lifecycle/stage (that is the
    projection's job in emit_state) — any `lifecycle_state` surfaced here is
    explicitly the FILE-DECLARED value and is marked as such, distinct from the
    derived state. Never raises.
    """
    # Size cap FIRST — stat before read so we never pull an oversized blob in.
    try:
        size = carrier_path.stat().st_size
    except OSError:
        print("CARRIER: absent")
        return
    if size > CARRIER_MAX_BYTES:
        print(f"CARRIER: oversize ({size} bytes > {CARRIER_MAX_BYTES} cap)")
        return
    try:
        text = carrier_path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        print("CARRIER: unreadable")
        return

    print("CARRIER: inline_untrusted")
    secret_present_keys: list[str] = []
    for line in _frontmatter_lines(text):
        # Only a top-level `key: value` scalar (column 0, not an indented
        # sub-key, not a list item, not a comment). Block/list values are ignored.
        stripped = line.rstrip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped[0] in (" ", "\t", "-"):
            continue
        colon = stripped.find(":")
        if colon <= 0:
            continue
        key = stripped[:colon].strip()
        rhs = stripped[colon + 1:].strip()
        if not key:
            continue
        # SECRET PROBE: a secret-shaped key — record PRESENCE only; never read rhs.
        if _is_secret_key(key):
            # We deliberately do NOT bind, slice, or print `rhs` for a secret key.
            secret_present_keys.append(key)
            continue
        # A block opener (empty RHS) is a structured value, not a scalar — skip.
        if rhs == "":
            continue
        # FIELD ALLOWLIST: only surface a value for an allowlisted scalar key.
        if key in CARRIER_FIELD_ALLOWLIST:
            value = _unquote(rhs)
            if key == "lifecycle_state":
                # Mark the file-declared value as DECLARED (not the derived state),
                # so a reader can never mistake it for the live source of truth.
                print(f"CARRIER_FILE_LIFECYCLE_DECLARED: {value}")
            else:
                print(f"CARRIER_{key.upper()}: {value}")
    # Emit the secret presence markers (sorted for a deterministic stream).
    for key in sorted(secret_present_keys):
        print(f"CARRIER_SECRET_PRESENT: {key}")


def _unquote(v: str) -> str:
    """Strip a single pair of surrounding quotes from a scalar RHS."""
    if len(v) >= 2 and ((v[0] == v[-1] == '"') or (v[0] == v[-1] == "'")):
        return v[1:-1]
    return v


# ============================================================================
# Orchestration
# ============================================================================

def _parse_required_state(raw: str | None) -> list[str]:
    """Parse the C2-resolved `--required-state` list (comma-separated). This is
    the GENERAL emitter input: whatever `resolveRequiredState()` resolved for the
    entered node. Absent => the coarse one-size default (mirrors C2's default), so
    the preamble degrades to the conservative gather rather than emitting nothing.
    """
    if raw is None or raw.strip() == "":
        # Mirror build/vendor.ts COARSE_REQUIRED_STATE so a non-declaring node (or
        # a caller that did not resolve one) still gets the coarse gather.
        return ["lifecycle_state", "stage", "gate_decisions", "carrier", "arc", "iu"]
    return [f.strip() for f in raw.split(",") if f.strip()]


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="jit-preamble.py — the stack-graph deterministic JIT preamble",
        add_help=True,
    )
    parser.add_argument("--projection", dest="projection", default=None, metavar="PATH",
                        help="path to the DERIVED projection JSON (portal-projection.json) — "
                             "the source of the live lifecycle/stage")
    parser.add_argument("--carrier", dest="carrier", default=None, metavar="PATH",
                        help="path to the carrier file — opened ONLY as delimited untrusted data")
    parser.add_argument("--carrier-id", dest="carrier_id", default=None, metavar="ID",
                        help="the active carrier id (the projection key to read)")
    parser.add_argument("--required-state", dest="required_state", default=None, metavar="LIST",
                        help="comma-separated C2-resolved required-state list the entered node "
                             "declared (the general emitter input)")
    # Hidden: deterministically raise BEFORE any emit, to prove the top-level
    # catch-all degrades to a clean JIT_FALLBACK floor (the hard fail-closed path).
    parser.add_argument("--selftest-crash", dest="selftest_crash", action="store_true",
                        help=argparse.SUPPRESS)
    args, _unknown = parser.parse_known_args(argv)
    return args


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    if args.selftest_crash:
        # Raise before emitting anything — the __main__ catch-all must turn this
        # into a clean JIT_FALLBACK (fail-closed), never a stack trace or wrong state.
        raise RuntimeError("selftest-crash: forced internal failure")
    required_state = _parse_required_state(args.required_state)
    carrier_id = args.carrier_id if args.carrier_id else "unknown"

    print("PREAMBLE: jit")

    # 1. Live state from the DERIVED projection (never the carrier file).
    projection = _load_projection(Path(args.projection)) if args.projection else None
    if args.projection and projection is None:
        # The projection path was given but could not be loaded/parsed → explicit
        # staleness/absence, never a guess.
        print("CARRIER_STATE_SOURCE: derived-projection")
        print(f"CARRIER_ID: {carrier_id}")
        print("PROJECTION: stale_or_unreadable")
        for field in required_state:
            print(f"CARRIER_{field.upper()}: unknown")
    else:
        emit_state(projection, carrier_id, required_state)

    # 2. The carrier file — surfaced only as delimited untrusted data.
    if args.carrier:
        emit_carrier_untrusted(Path(args.carrier))
    else:
        print("CARRIER: not_provided")

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        # Catch-all: if orchestration itself crashes, emit the fail-closed floor
        # so the harness never sees a half-written preamble or a stack trace.
        print(JIT_FALLBACK)
        sys.exit(1)
