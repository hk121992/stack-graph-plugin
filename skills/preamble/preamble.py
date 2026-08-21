#!/usr/bin/env python3
"""jit-preamble.py — the stack-graph deterministic JIT preamble.

A just-in-time, per-turn context loader. It loads the live state of the active
carrier and emits one stream of `KEY: VALUE` lines on stdout for the invoking
skill to parse into turn-1 session state — so the per-turn context is
FRESH, SAFE, and CHEAP, and no fat always-on reference is carried.

Five load-bearing disciplines (each proven by a fixture in preamble.test.ts):

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

  5. COLLECTION KEYS RESOLVE VIA THE BINDINGS. A kebab-case required-state key
     names a COLLECTION-LEVEL surface (the inherited convention: kebab-case =
     collection, snake_case = carrier field). Those keys resolve through the
     harness bindings surface (`--bindings`), never the carrier projection —
     `open-iu-manifest` via the `improvements-manifest` binding (the manifest's
     non-terminal entries), `triage-source-queue` via the optional
     `triage-source` binding, whose value is a whitespace-separated descriptor
     LIST (each token a filesystem path, `gh:<owner>/<repo>[?label=]`, or
     `ledger:<manifest>?states=…[&intent_signed=false]`) merged into the ONE
     queue emit — binding order, dedup by rendered id, the global cap. Emit
     vocabulary: `unbound` (the binding key is deliberately not present — a
     valid quiet state) ≠ `absent` (bound but unresolvable — the harness-defect
     signal; over a list, ANY broken token); `empty` (bound, resolvable, zero
     entries — over a list, only when EVERY source is). No `--bindings` input at
     all keeps the explicit fail-closed `absent`. A collection entry surfaces
     IDENTITY FIELDS ONLY (id · state · title) — a queue/issue body is external
     intake, interpreted at the triage boundary, never emitted into turn-1
     context.

Runtime: Python 3 stdlib only. No third-party dependencies.
Determinism: the emit is a pure function of the inputs (no clock, no randomness,
no environment leakage) — the SAME inputs produce a BYTE-IDENTICAL stream, so the
preamble can be golden-tested and is idempotent across repeated turns. A
`gh:`-bound token is as deterministic as the listing it names — the one
carved-out external input kind; every local path (file, dir, ledger) stays pure.
Time budget: <500ms (all local). The ONLY subprocess/network path is an
explicitly-bound `gh:` triage-source token (a read-only issue listing via
the gh CLI); the test suite never hits it live — it injects a deterministic stub.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path


# ============================================================================
# Constants — the untrusted-data discipline knobs + the fail-closed floor
# ============================================================================

# Hard size cap on the untrusted carrier file (bytes). A carrier file larger than
# this is refused outright — we surface `CARRIER: oversize` and skip the field
# scan rather than read an unbounded attacker-controlled blob into memory.
CARRIER_MAX_BYTES = 64 * 1024

# Canonical carrier-id grammar, shared by record-gate/analyzer contracts.
CARRIER_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")

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
# matches is NEVER surfaced as a value — only a presence marker is emitted. The
# discipline: report present/absent, never the value. Matching is on the KEY
# NAME only; the value is never bound to a variable.
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
    emitter. `required_state` is the C2-resolved list of CARRIER-scoped state
    fields the entered node declared it needs (e.g. `[lifecycle_state, stage]`
    for the carrier-finder, or the coarse default for a non-declaring node);
    collection-level keys never route here — they are bindings-resolved by
    `emit_collections` (discipline 5). For EACH requested field we emit its
    DERIVED value from the projection, or an explicit `<unknown|absent|stale>`
    marker — never a confidently-wrong stale value.

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


def _scan_flat_scalars(lines: list[str]):
    """Yield (key, rhs) for each top-level `key: value` scalar line — the ONE
    line-level scan (no YAML engine, never eval, never follow a reference) that
    both the untrusted carrier frontmatter and the bindings surface ride. Skips
    blanks, comments, indented/nested lines, and list items; policy (secret
    probing, allowlisting, comment stripping, unquoting) stays at the call site."""
    for line in lines:
        stripped = line.rstrip()
        if not stripped or stripped.lstrip().startswith("#"):
            continue
        if stripped[0] in (" ", "\t", "-"):
            continue
        colon = stripped.find(":")
        if colon <= 0:
            continue
        key = stripped[:colon].strip()
        if not key:
            continue
        yield key, stripped[colon + 1:].strip()


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
    # Only top-level `key: value` scalars (the shared _scan_flat_scalars discipline);
    # block/list values are ignored. THIS caller's policy: probe secrets, allowlist.
    for key, rhs in _scan_flat_scalars(_frontmatter_lines(text)):
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
# Collection-level keys — bindings-resolved (discipline 5)
# ============================================================================

# Size cap on the bindings surface itself — a small, harness-authored file.
BINDINGS_MAX_BYTES = 64 * 1024

# Size cap on a collection target (a manifest / queue file) — same refuse-don't-read
# discipline as the carrier cap, sized for a whole-workspace manifest.
COLLECTION_MAX_BYTES = 256 * 1024

# At most this many entries are rendered per collection emit; a gh listing is
# probed at cap+1 so an at-cap render says `50+`, never a false exact total. The
# head always names the total so truncation is explicit, never silent.
COLLECTION_ENTRY_CAP = 50

# Per-field character cap in a rendered entry (a queue/issue title is external
# intake — bounded, control-characters stripped, structural metacharacters
# neutralised, never allowed to break the KEY: VALUE line discipline).
_FIELD_MAX_CHARS = 120

# Terminal lifecycle states — a manifest entry in one of these is NOT open.
# `closed`/`parked`/`killed` per the gate-model ordered set; `landed` is the
# historical terminal spelling still carried by older manifest rows.
_TERMINAL_LIFECYCLE = frozenset({"closed", "parked", "killed", "landed"})

# The `gh:` triage-source descriptor: gh:<owner>/<repo>[?label=<label>].
_GH_DESCRIPTOR = re.compile(
    r"^gh:([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)(?:\?label=([^\s&]+))?$"
)

# The `ledger:` triage-source descriptor:
#   ledger:<manifest-path>?states=<s1,s2>[&intent_signed=false]
# `states=` is REQUIRED (a ledger source is always a state-filtered view, never a
# whole-manifest dump); the optional gate-pending filter accepts ONLY the literal
# `intent_signed=false`. Anything else — no query, an unknown param,
# `intent_signed=true` — is malformed ⇒ `absent` (loud, never a silent flood).
_LEDGER_DESCRIPTOR = re.compile(
    r"^ledger:([^?\s]+)\?states=([A-Za-z0-9_,-]+)(?:&intent_signed=(false))?$"
)


def _load_bindings(bindings_path: Path) -> dict[str, str] | None:
    """Parse the harness bindings surface (flat `key: value` YAML) via the shared
    _scan_flat_scalars line-level scan (no YAML engine). utf-8-sig: a BOM'd file
    must not misread its first key as unbound. Returns the key->value map, or
    None on any read failure / oversize (the caller then emits the fail-closed
    `absent` for every collection key). Never raises."""
    try:
        size = bindings_path.stat().st_size
    except (OSError, ValueError):
        return None
    if size > BINDINGS_MAX_BYTES:
        return None
    try:
        text = bindings_path.read_text(encoding="utf-8-sig")
    except (OSError, UnicodeDecodeError, ValueError):
        return None
    bindings: dict[str, str] = {}
    # THIS caller's policy over the shared scan: strip inline comments, unquote.
    for key, rhs in _scan_flat_scalars(text.split("\n")):
        bindings[key] = _unquote(_strip_inline_comment(rhs))
    return bindings


def _strip_inline_comment(rhs: str) -> str:
    """Drop a YAML inline comment from a scalar RHS: a quoted value ends at its
    closing quote; an unquoted value is cut at the first whitespace-preceded `#`."""
    if rhs[:1] in ('"', "'"):
        end = rhs.find(rhs[0], 1)
        return rhs[: end + 1] if end > 0 else rhs
    for i, ch in enumerate(rhs):
        if ch == "#" and (i == 0 or rhs[i - 1] in " \t"):
            return rhs[:i].rstrip()
    return rhs


def _clean_field(value: object) -> str:
    """Bound + sanitize one identity field for the emit — external intake stays a
    data token, never structure: control characters (incl. newlines — they must
    never mint a forged KEY: VALUE line) become spaces; the entry-grammar
    metacharacters are neutralised (`;` -> `,`, `=` -> `:`) so a hostile title
    cannot forge `id=…`/`state=…` structure inside the rendered value; the
    length is capped with an explicit ellipsis."""
    s = "".join(ch if ch.isprintable() else " " for ch in str(value))
    s = s.replace(";", ",").replace("=", ":").strip()
    if len(s) > _FIELD_MAX_CHARS:
        s = s[:_FIELD_MAX_CHARS] + "…"
    return s


def _entry_parts(entries: list[tuple[object, object, object]]) -> list[str]:
    """Format (id, title, state) tuples as rendered `id=… state=… title=…` parts —
    identity fields only, every field through the `_clean_field` sanitiser, capped
    at COLLECTION_ENTRY_CAP rendered entries. The ONE formatting seam both renderers
    (single-source + merged) share, so the sanitisation discipline cannot fork."""
    parts: list[str] = []
    for eid, title, state in entries[:COLLECTION_ENTRY_CAP]:
        bits: list[str] = []
        for label, field in (("id", eid), ("state", state), ("title", title)):
            if field is None:
                continue
            cleaned = _clean_field(field)
            if cleaned:
                bits.append(f"{label}={cleaned}")
        if bits:
            parts.append(" ".join(bits))
    return parts


def _render_entries(
    entries: list[tuple[object, object, object]],
    overflow_probe: bool = False,
) -> str:
    """Render (id, title, state) tuples as the collection VALUE: `empty`, or
    `<n> entries: id=… state=… title=…; …` — identity fields only, source order
    (deterministic: the order is the input's), capped with an explicit head.
    `overflow_probe`: the caller fetched cap+1 rows from a capped listing (gh) —
    it cannot know the true total, so an overflowing head says `50+`, never a
    false exact count; a full lister (file/dir/manifest) names the real total."""
    total = len(entries)
    if total == 0:
        return "empty"
    parts = _entry_parts(entries)
    if not parts:
        return "empty"
    if total <= COLLECTION_ENTRY_CAP:
        head = f"{total} entries"
    elif overflow_probe:
        head = f"{COLLECTION_ENTRY_CAP} of {COLLECTION_ENTRY_CAP}+ entries"
    else:
        head = f"{COLLECTION_ENTRY_CAP} of {total} entries"
    return f"{head}: " + "; ".join(parts)


def _render_merged(
    entries: list[tuple[object, object, object]],
    uncertain_total: bool,
) -> str:
    """Render a MERGED (multi-source) entry list: same `empty`/entry formatting as
    `_render_entries`, with the of-N head computed over the merged total. When any
    contributing gh listing was truncated at its cap+1 probe (`uncertain_total`),
    the merged total is only a known floor — the head says `<shown> of <total>+`,
    never a false exact count (the single-source `50 of 50+` convention, extended
    to the merge where the known floor exceeds the cap)."""
    total = len(entries)
    if total == 0:
        return "empty"
    parts = _entry_parts(entries)
    if not parts:
        return "empty"
    if uncertain_total:
        head = f"{min(total, COLLECTION_ENTRY_CAP)} of {total}+ entries"
    elif total <= COLLECTION_ENTRY_CAP:
        head = f"{total} entries"
    else:
        head = f"{COLLECTION_ENTRY_CAP} of {total} entries"
    return f"{head}: " + "; ".join(parts)


def _read_json_capped(target: Path) -> object | None:
    """Read + parse a JSON collection target under the size cap. None on any
    failure (missing, oversize, unreadable, unparseable, or a descriptor the
    filesystem refuses — permission denied, an embedded NUL). Never raises."""
    try:
        size = target.stat().st_size
    except (OSError, ValueError):
        return None
    if size > COLLECTION_MAX_BYTES:
        return None
    try:
        raw = target.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError, ValueError):
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def _identity_entries(data: object) -> list[tuple[object, object, object]] | None:
    """THE closed identity-field pick over a queue/issue listing: a JSON array of
    dicts -> (id, title, state) tuples — `id`, else `#<number>`; NOTHING else is
    ever read (a body/extra field is never touched). An entry with no identity
    at all (id, title, AND state absent) is dropped, so the rendered head count
    never overstates. None when `data` is not a list (the caller's `absent`).
    Every queue-shaped collector extracts through here, so the
    identity-fields-only closure lives in exactly one place."""
    if not isinstance(data, list):
        return None
    entries: list[tuple[object, object, object]] = []
    for e in data:
        if not isinstance(e, dict):
            continue
        eid = e.get("id")
        if eid is None:
            num = e.get("number")
            eid = f"#{num}" if isinstance(num, int) else None
        title, state = e.get("title"), e.get("state")
        if eid is None and title is None and state is None:
            continue
        entries.append((eid, title, state))
    return entries


def _collect_open_iu_manifest(descriptor: str) -> str:
    """`open-iu-manifest` — the improvements manifest's OPEN rows: every entry
    whose lifecycle_state is non-terminal. Identity fields only (id · state)."""
    data = _read_json_capped(Path(descriptor))
    if not isinstance(data, list):
        return "absent"
    open_entries: list[tuple[object, object, object]] = []
    for e in data:
        if not isinstance(e, dict):
            continue
        state = e.get("lifecycle_state")
        state_s = state if isinstance(state, str) and state else "unknown"
        if state_s in _TERMINAL_LIFECYCLE:
            continue
        open_entries.append((e.get("id"), e.get("title"), state_s))
    return _render_entries(open_entries)


# One fetched queue source: (kind, repo, entries, truncated) — `kind` drives the
# cross-source id disambiguation (`gh` only), `repo` is the gh repo name (None
# otherwise), `entries` the (id, title, state) tuples, `truncated` True when a
# capped gh listing returned cap+1 rows (the true total is unknowable). A fetcher
# returns None for `absent` (malformed / unresolvable) — the aggregate signal.
_QueueSource = tuple[str, str | None, list[tuple[object, object, object]], bool]


def _fetch_queue_path(descriptor: str) -> _QueueSource | None:
    """A filesystem-path triage-source descriptor: a DIRECTORY lists its files as
    entries (id = filename stem, state = queued — bodies are never read), a FILE
    is a JSON array of `{id|number, title, state}` entries (identity fields
    only — any body/extra field is never touched). A path the filesystem refuses
    (permission denied, an embedded NUL) is None → `absent` — caught HERE at the
    fetcher seam, never escaping into a half-written emit."""
    target = Path(descriptor)
    try:
        is_dir = target.is_dir()
    except (OSError, ValueError):
        return None
    if is_dir:
        try:
            names = sorted(
                p.name for p in target.iterdir()
                if p.is_file() and not p.name.startswith(".")
            )
        except (OSError, ValueError):
            return None
        return ("path", None, [(Path(n).stem, None, "queued") for n in names], False)
    entries = _identity_entries(_read_json_capped(target))
    if entries is None:
        return None
    return ("path", None, entries, False)


def _fetch_queue_gh(descriptor: str) -> _QueueSource | None:
    """A `gh:<owner>/<repo>[?label=<label>]` triage-source descriptor: a READ-ONLY
    open-issue listing through the gh CLI (identity-field JSON only; a
    locale-independent utf-8 decode). Any failure — malformed descriptor,
    missing/failing gh, unparseable output — is None → `absent` (bound but
    unresolvable), never a crash. The suite stubs `gh`; never live. The listing
    is requested at cap+1 (the overflow probe): a capped listing cannot reveal
    the true total, so a cap+1 return marks the source truncated and an at-cap
    single-source render heads `50 of 50+ entries`."""
    m = _GH_DESCRIPTOR.match(descriptor)
    if not m:
        return None
    owner, repo, label = m.groups()
    cmd = [
        "gh", "issue", "list",
        "--repo", f"{owner}/{repo}",
        "--state", "open",
        "--json", "number,title,state",
        "--limit", str(COLLECTION_ENTRY_CAP + 1),
    ]
    if label:
        cmd += ["--label", label]
    try:
        res = subprocess.run(
            cmd, capture_output=True, encoding="utf-8", errors="replace", timeout=20,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if res.returncode != 0:
        return None
    try:
        data = json.loads(res.stdout)
    except json.JSONDecodeError:
        return None
    entries = _identity_entries(data)
    if entries is None:
        return None
    return ("gh", repo, entries, len(entries) > COLLECTION_ENTRY_CAP)


def _fetch_queue_ledger(descriptor: str) -> _QueueSource | None:
    """A `ledger:<manifest-path>?states=<s1,s2>[&intent_signed=false]` descriptor:
    a state-filtered view over a WORK-LEDGER manifest (a JSON array of rows) —
    `states=` matches each row's `lifecycle_state`; `intent_signed=false`
    additionally requires the DERIVED `intent_signed` column to be present AND
    false. A manifest without that column (any row lacking a boolean
    `intent_signed`) is None → `absent` for the whole descriptor — the loud
    harness-defect signal, never a silent unfiltered flood. Entries surface
    identity fields only (id · lifecycle_state · title when the ledger carries
    one) through the same `_clean_field` pipeline as every external source; a
    row's other fields (file, improves, tier, …) are never read into the emit."""
    m = _LEDGER_DESCRIPTOR.match(descriptor)
    if not m:
        return None
    manifest_path, states_raw, unsigned = m.groups()
    states = frozenset(s for s in states_raw.split(",") if s)
    if not states:
        return None
    data = _read_json_capped(Path(manifest_path))
    if not isinstance(data, list):
        return None
    rows = [e for e in data if isinstance(e, dict)]
    if unsigned is not None:
        # The gate-pending filter is only meaningful over the derived column —
        # require a boolean `intent_signed` on EVERY row before filtering on it.
        if any(not isinstance(e.get("intent_signed"), bool) for e in rows):
            return None
    entries: list[tuple[object, object, object]] = []
    for e in rows:
        state = e.get("lifecycle_state")
        if not isinstance(state, str) or state not in states:
            continue
        if unsigned is not None and e.get("intent_signed") is not False:
            continue
        entries.append((e.get("id"), e.get("title"), state))
    return ("ledger", None, entries, False)


def _fetch_queue_source(token: str) -> _QueueSource | None:
    """Dispatch ONE descriptor token by the per-descriptor grammar: `gh:` shells
    to the read-only gh listing; `ledger:` reads a work-ledger manifest through
    its state filter; anything else is a filesystem path (file | dir).
    None → the token is malformed/unresolvable (the `absent` signal)."""
    if token.startswith("gh:"):
        return _fetch_queue_gh(token)
    if token.startswith("ledger:"):
        return _fetch_queue_ledger(token)
    return _fetch_queue_path(token)


def _collect_queue_descriptor(descriptor: str) -> str:
    """`triage-source-queue` — the binding VALUE is a whitespace-separated
    descriptor LIST; each token must satisfy the per-descriptor grammar.

    A SINGLE token renders byte-identically to the landed single-source emit
    (same fetch, same render, same overflow head). MULTIPLE tokens merge into the
    one queue emit: binding order · cross-source id disambiguation · dedup by
    rendered id · the global cap with the of-N head over the merged total.
    Aggregate vocabulary: ANY token malformed/unresolvable ⇒ the whole key
    `absent` (broken wiring stays loud); `empty` only when every source is
    bound, resolvable, and empty."""
    tokens = descriptor.split()
    if not tokens:
        return "absent"
    if len(tokens) == 1:
        source = _fetch_queue_source(tokens[0])
        if source is None:
            return "absent"
        _kind, _repo, entries, truncated = source
        # The fetcher's own truncation signal drives the head (a non-truncating
        # fetch is exact whatever its kind) — byte-identical for every landed
        # case: only a cap+1 gh return renders the `50 of 50+` head.
        return _render_entries(entries, overflow_probe=truncated)
    sources: list[_QueueSource] = []
    for token in tokens:
        source = _fetch_queue_source(token)
        if source is None:
            return "absent"
        sources.append(source)
    # Cross-source id disambiguation (gh only): with MORE than one gh source a gh
    # entry id renders `<repo>#<n>`; a single gh source keeps today's `#<n>`.
    gh_sources = sum(1 for kind, _r, _e, _t in sources if kind == "gh")
    merged: list[tuple[object, object, object]] = []
    seen_ids: set[str] = set()
    uncertain_total = False
    for kind, repo, entries, truncated in sources:
        uncertain_total = uncertain_total or truncated
        for eid, title, state in entries:
            if kind == "gh" and gh_sources > 1 and isinstance(eid, str) and eid.startswith("#"):
                eid = f"{repo}{eid}"
            # Dedup by RENDERED id (after disambiguation) — first occurrence wins
            # (binding order); an id-less entry is never deduped away.
            rendered_id = _clean_field(eid) if eid is not None else ""
            if rendered_id:
                if rendered_id in seen_ids:
                    continue
                seen_ids.add(rendered_id)
            merged.append((eid, title, state))
    return _render_merged(merged, uncertain_total)


# The closed registry of collection-level required-state keys: kebab-case key ->
# (the harness binding that names its surface, the loader that resolves it).
# Teaching the emitter another collection surface IS one line here plus its
# loader — pure content, no re-plumb.
COLLECTION_BINDINGS = {
    "triage-source-queue": ("triage-source", _collect_queue_descriptor),
    "open-iu-manifest": ("improvements-manifest", _collect_open_iu_manifest),
}


def _resolve_collection_value(key: str, bindings: dict[str, str]) -> str:
    """One collection key -> its emitted VALUE, through the vocabulary: `unbound`
    (the binding key is deliberately not present — valid, quiet) / `absent`
    (bound but unresolvable — the harness-defect signal) / `empty` / the entries."""
    binding_name, loader = COLLECTION_BINDINGS[key]
    if binding_name not in bindings:
        return "unbound"
    descriptor = bindings[binding_name].strip()
    if not descriptor:
        return "absent"  # bound to nothing — unresolvable, not deliberate absence
    return loader(descriptor)


def emit_collections(collection_keys: list[str], bindings_path: Path | None) -> None:
    """Emit the collection-level keys, bindings-resolved. No bindings input at
    all (or an unreadable bindings surface) keeps today's explicit fail-closed
    `absent` for every collection key — never a guess, never a crash. Key
    spellings are `CARRIER_` + the key uppercased, kebab-case PRESERVED."""
    bindings = _load_bindings(bindings_path) if bindings_path else None
    for key in collection_keys:
        if bindings is None:
            print(f"CARRIER_{key.upper()}: absent")
        else:
            print(f"CARRIER_{key.upper()}: {_resolve_collection_value(key, bindings)}")


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


def _load_carrier_contract(path: Path, node_id: str) -> tuple[str, list[str]] | None:
    """Resolve one node's graph-derived carrier contract. Never guesses.

    The bundled JSON is generated from canonical `required-state` declarations;
    it is the runtime bridge from graph metadata to this host-neutral preflight.
    """
    try:
        obj = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    if not isinstance(obj, dict) or obj.get("version") != 1:
        return None
    nodes = obj.get("nodes")
    row = nodes.get(node_id) if isinstance(nodes, dict) else None
    if not isinstance(row, dict):
        return None
    entry = row.get("entry")
    state = row.get("required_state")
    if entry not in ("creates", "requires") or not isinstance(state, list) or not state:
        return None
    if not all(isinstance(item, str) and item for item in state):
        return None
    return entry, state


def _validate_carrier_entry(carrier_path: Path, carrier_id: str) -> str | None:
    """Validate carrier identity before a carrier-required skill may act."""
    if not CARRIER_ID_RE.fullmatch(carrier_id):
        return "carrier id is missing or invalid"
    path_id = carrier_path.name[:-3] if carrier_path.name.endswith(".md") else carrier_path.name
    if path_id != carrier_id:
        return "carrier id does not match the carrier path"
    try:
        size = carrier_path.stat().st_size
        if not carrier_path.is_file():
            return "carrier path is not a file"
    except OSError:
        return "carrier file is missing or unreadable"
    if size > CARRIER_MAX_BYTES:
        return "carrier file exceeds the size cap"
    try:
        text = carrier_path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return "carrier file is missing or unreadable"
    lines = _frontmatter_lines(text)
    if not lines:
        return "carrier frontmatter is missing or invalid"
    found_ids = []
    for key, rhs in _scan_flat_scalars(lines):
        if key == "id" and rhs:
            found_ids.append(_unquote(rhs))
    if len(found_ids) != 1:
        return "carrier frontmatter id is missing or duplicated"
    if found_ids[0] != carrier_id:
        return "carrier id does not match carrier frontmatter"
    return None


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
    parser.add_argument("--bindings", dest="bindings", default=None, metavar="PATH",
                        help="the harness bindings surface (flat key: value YAML) — resolves "
                             "the collection-level (kebab-case) required-state keys; without "
                             "it those keys emit the fail-closed `absent`")
    parser.add_argument("--required-state", dest="required_state", default=None, metavar="LIST",
                        help="comma-separated C2-resolved required-state list the entered node "
                             "declared (the general emitter input)")
    parser.add_argument("--node", dest="node", default=None, metavar="ID",
                        help="entered skill id; resolves entry mode + required-state from the "
                             "bundled graph-derived carrier contract")
    parser.add_argument("--carrier-contract", dest="carrier_contract", default=None, metavar="PATH",
                        help="override the bundled carrier-contract.json (tests only)")
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
    entry = None
    if args.node:
        contract_path = Path(args.carrier_contract) if args.carrier_contract else Path(__file__).with_name("carrier-contract.json")
        resolved = _load_carrier_contract(contract_path, args.node)
        if resolved is None:
            print("PREAMBLE: blocked")
            print("PREAMBLE_ERROR: graph-derived carrier contract is missing, invalid, or has no entered node")
            return 2
        entry, graph_state = resolved
        supplied = _parse_required_state(args.required_state) if args.required_state is not None else graph_state
        if supplied != graph_state:
            print("PREAMBLE: blocked")
            print("PREAMBLE_ERROR: required-state does not match the graph-derived contract")
            return 2
        required_state = graph_state

    # Carrier-required entry is a hard gate. Refuse before emitting any runtime
    # state: a fallback stream is not authority to proceed without a carrier.
    if entry == "requires":
        if not args.carrier or not args.carrier_id:
            print("PREAMBLE: blocked")
            print("PREAMBLE_ERROR: this skill requires --carrier and --carrier-id")
            return 2
        carrier_error = _validate_carrier_entry(Path(args.carrier), args.carrier_id)
        if carrier_error:
            print("PREAMBLE: blocked")
            print(f"PREAMBLE_ERROR: {carrier_error}")
            return 2
    # Split the resolved list: collection-level keys (the closed registry) resolve
    # via the BINDINGS; everything else is a carrier field the projection serves.
    collection_keys = [f for f in required_state if f in COLLECTION_BINDINGS]
    carrier_fields = [f for f in required_state if f not in COLLECTION_BINDINGS]
    carrier_id = args.carrier_id if args.carrier_id else "unknown"

    print("PREAMBLE: jit")

    # 1. Live carrier state from the DERIVED projection (never the carrier file).
    #    A purely collection-level invocation (triage's step 0: no --carrier-id, no
    #    carrier fields) has no projection block — no misleading absent_for_carrier.
    if carrier_fields or args.carrier_id:
        projection = _load_projection(Path(args.projection)) if args.projection else None
        if args.projection and projection is None:
            # The projection path was given but could not be loaded/parsed → explicit
            # staleness/absence, never a guess.
            print("CARRIER_STATE_SOURCE: derived-projection")
            print(f"CARRIER_ID: {carrier_id}")
            print("PROJECTION: stale_or_unreadable")
            for field in carrier_fields:
                print(f"CARRIER_{field.upper()}: unknown")
        else:
            emit_state(projection, carrier_id, carrier_fields)

    # 2. Collection-level keys — bindings-resolved (unbound ≠ absent; fail-closed
    #    absent when no bindings input was supplied).
    if collection_keys:
        emit_collections(collection_keys, Path(args.bindings) if args.bindings else None)

    # 3. The carrier file — surfaced only as delimited untrusted data.
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
