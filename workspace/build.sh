#!/usr/bin/env bash
# Workspace portal assembly (A3b-6).
#
# Builds every surface into workspace/dist/ as one deployable static site:
#   dist/                 — portal hub (index.html) + shared root assets + /fonts/
#   dist/handbook/        — the canon
#   dist/graph/           — the whole-graph browser
#   dist/dashboard/       — the work-ledger-first product-dashboard
#   dist/analytics/       — thin, input-gated
#   dist/portal-projection.json — the sanitized projection snapshot (degraded/empty
#                                  in the factory; published from .stack-graph/ locally)
#
# Order matters: the projection snapshot is published FIRST so the dashboard +
# analytics can join it (degrading loudly when it is empty/stale).
#
# Phase C (a product harness): set DASHBOARD_ROOT=<be-civic ledger path> to render
# real work-items instead of the factory fixture.
#
# Usage: bash workspace/build.sh
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root

DIST="workspace/dist"
PROJECTION="$DIST/portal-projection.json"
# Canvas root resolution. The canvas surface AND the dashboard bets-rollup read the
# same canvas.json, so the factory portal dogfoods its OWN bets. But a harness that
# binds DASHBOARD_ROOT and omits CANVAS_ROOT must NOT inherit the factory fixture (that
# would render stack-graph's bets inside the harness dashboard) — it gets no canvas, and
# the rollup degrades to "canvas not bound" (the documented optional-binding behaviour).
#   CANVAS_ROOT set      → use it (a real binding, factory or harness)
#   else no DASHBOARD_ROOT (the factory's own build) → the factory fixture (dogfood)
#   else (a harness without a canvas binding) → none (degrade)
if [ -n "${CANVAS_ROOT:-}" ]; then
  CANVAS_ROOT_RESOLVED="$CANVAS_ROOT"
elif [ -z "${DASHBOARD_ROOT:-}" ]; then
  CANVAS_ROOT_RESOLVED="workspace/renderer/fixtures/canvas"
else
  CANVAS_ROOT_RESOLVED=""
fi

echo "==> clean $DIST"
rm -rf "$DIST"
mkdir -p "$DIST"

echo "==> publish projection snapshot (empty/degraded when no .stack-graph events exist)"
bun run workspace/renderer/publish-projection.ts --out "$PROJECTION" || true

echo "==> handbook surface"
bun run workspace/renderer/build-handbook.ts

echo "==> graph browser surface"
bun run workspace/renderer/build-graph.ts

echo "==> product-dashboard surface (ledger: ${DASHBOARD_ROOT:-fixture}; canvas: ${CANVAS_ROOT_RESOLVED:-unbound})"
bun run workspace/renderer/build-dashboard.ts ${DASHBOARD_ROOT:+--root "$DASHBOARD_ROOT"} ${CANVAS_ROOT_RESOLVED:+--canvas-root "$CANVAS_ROOT_RESOLVED"} --projection "$PROJECTION"

echo "==> analytics surface"
bun run workspace/renderer/build-analytics.ts --projection "$PROJECTION"

if [ -n "$CANVAS_ROOT_RESOLVED" ]; then
  echo "==> canvas surface (BMC + VPC)"
  bun run workspace/renderer/build-canvas.ts --root "$CANVAS_ROOT_RESOLVED"
else
  echo "==> canvas surface skipped (no canvas-root bound — the dashboard rollup degrades)"
fi

echo "==> portal hub + shared root assets + fonts"
bun run workspace/renderer/build-portal.ts

echo "==> cloudflare static-asset files"
for f in _headers _redirects; do
  if [ -f "workspace/$f" ]; then cp "workspace/$f" "$DIST/$f"; echo "  [cf] $f"; fi
done

echo "==> assembled. surfaces:"
find "$DIST" -maxdepth 1 -mindepth 1 | sort
