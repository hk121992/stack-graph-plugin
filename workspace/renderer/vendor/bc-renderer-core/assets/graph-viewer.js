/* requires-graph progressive enhancement layer.
 *
 * Originally mounted to figure.requires-graph (KG skill pages with a
 * skill-requires subgraph). Phase 3 of the renderer-unification mini-
 * sprint (2026-05-23) extended the attach surface to a FIGURE_CLASSES
 * enum so additional figure classes can opt in without further script
 * edits. Today: requires-graph (KG) + domain-diagram (bc-specs).
 *
 * Loaded conditionally on KG (skill pages with a graph only) and
 * always on bc-specs (DomainDiagram figures need pan/zoom on the
 * domain page). Reads data-density-tier on the <figure> to decide
 * which controls to mount:
 *
 *   compact  → hover path-highlight only
 *   standard → hover + pan/zoom + fullscreen + keyboard focus-pan
 *   dense    → standard + minimap
 *
 * The SVG itself is post-processed at build time (skill-graph.ts on
 * KG-side requires graphs; raw-SVG inlined as-is on bc-specs domain
 * diagrams). This script does no DOM rewriting beyond mounting
 * controls and managing viewBox state.
 *
 * FIGURE_CLASSES below MUST stay in sync with the TS const
 * `FIGURE_CLASSES` in src/index.ts and the JS const in
 * assets/figure-classes.js. The unit test
 * `__tests__/figure-classes.test.ts` enforces this invariant.
 */

(function () {
  'use strict';

  // Mirror of FIGURE_CLASSES from the package's TS + JS exports.
  // Adding a new figure class is a one-line PR across all three.
  var FIGURE_CLASSES = ['requires-graph', 'domain-diagram'];

  function init() {
    var selector = FIGURE_CLASSES.map(function (c) { return 'figure.' + c; }).join(',');
    document.querySelectorAll(selector).forEach(function (fig) {
      try { mountRequiresGraph(fig); }
      catch (err) { console.warn('[requires-graph] mount failed', err); }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ─── Mount ──────────────────────────────────────────────────────────────

  function mountRequiresGraph(figureEl) {
    const stage = figureEl.querySelector('.requires-graph-stage');
    const svg = stage && stage.querySelector('svg');
    if (!stage || !svg) return null;

    const tier = figureEl.dataset.densityTier || 'compact';
    const initialViewBox = parseViewBox(svg);

    const ctx = {
      figureEl, stage, svg, tier,
      initialViewBox,
      viewBox: Object.assign({}, initialViewBox),
      zoom: 1,
      edgeIndex: indexEdges(svg),
    };

    installPathHighlight(ctx);

    if (tier === 'compact') return ctx;

    // Dense tier opts out of the natural-size cap so pan/zoom can use the
    // full stage area. Standard keeps the cap (server set it inline) so the
    // SVG renders at natural size and pan/zoom stays a tap-into-it action.
    if (tier === 'dense') {
      svg.style.maxWidth = '';
      svg.style.maxHeight = '';
      svg.style.width = '100%';
      svg.style.height = '100%';
    }

    installPanZoom(ctx);
    installControls(ctx);
    installKeyboardFocusPan(ctx);

    if (tier === 'dense') installMinimap(ctx);

    return ctx;
  }

  // ─── viewBox + edge indexing ───────────────────────────────────────────

  function parseViewBox(svg) {
    const raw = svg.getAttribute('viewBox') || '0 0 100 100';
    const parts = raw.split(/[\s,]+/).map(Number);
    return { x: parts[0] || 0, y: parts[1] || 0, w: parts[2] || 100, h: parts[3] || 100 };
  }

  function indexEdges(svg) {
    const byTo = new Map();
    const byFrom = new Map();
    svg.querySelectorAll('g.edge[data-from][data-to]').forEach((edge) => {
      const from = edge.getAttribute('data-from');
      const to = edge.getAttribute('data-to');
      if (!byTo.has(to)) byTo.set(to, []);
      byTo.get(to).push({ parent: from, edgeEl: edge });
      if (!byFrom.has(from)) byFrom.set(from, []);
      byFrom.get(from).push({ child: to, edgeEl: edge });
    });
    return { byTo, byFrom };
  }

  // ─── Hover/focus path highlight ────────────────────────────────────────

  function installPathHighlight(ctx) {
    const nodes = ctx.svg.querySelectorAll('g.node[data-skill-id]');
    nodes.forEach((node) => {
      const enter = () => highlightLineage(ctx, node);
      const leave = () => clearHighlight(ctx);
      node.addEventListener('mouseenter', enter);
      node.addEventListener('mouseleave', leave);
      node.addEventListener('focusin', enter);
      node.addEventListener('focusout', leave);
    });
  }

  function highlightLineage(ctx, targetNode) {
    const targetId = targetNode.getAttribute('data-skill-id');
    if (!targetId) return;
    const activeNodeIds = new Set([targetId]);
    const activeEdges = new Set();
    const queue = [targetId];
    while (queue.length) {
      const id = queue.shift();
      const parents = ctx.edgeIndex.byTo.get(id) || [];
      for (const { parent, edgeEl } of parents) {
        activeEdges.add(edgeEl);
        if (!activeNodeIds.has(parent)) {
          activeNodeIds.add(parent);
          queue.push(parent);
        }
      }
    }
    ctx.figureEl.classList.add('is-highlighting');
    ctx.svg.querySelectorAll('g.node').forEach((n) => {
      n.classList.toggle('path-active', activeNodeIds.has(n.getAttribute('data-skill-id')));
    });
    ctx.svg.querySelectorAll('g.edge').forEach((e) => {
      e.classList.toggle('path-active', activeEdges.has(e));
    });
  }

  function clearHighlight(ctx) {
    ctx.figureEl.classList.remove('is-highlighting');
    ctx.svg.querySelectorAll('.path-active').forEach((el) => el.classList.remove('path-active'));
  }

  // ─── Pan/zoom (viewBox math, no library) ────────────────────────────────

  function installPanZoom(ctx) {
    const { svg, stage } = ctx;
    applyViewBox(ctx);

    let dragging = null;
    svg.addEventListener('pointerdown', (e) => {
      if (e.target.closest('a')) return;
      dragging = { startX: e.clientX, startY: e.clientY, startVB: Object.assign({}, ctx.viewBox) };
      svg.classList.add('is-panning');
      svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const rect = stage.getBoundingClientRect();
      const dx = (e.clientX - dragging.startX) * (ctx.viewBox.w / rect.width);
      const dy = (e.clientY - dragging.startY) * (ctx.viewBox.h / rect.height);
      ctx.viewBox.x = dragging.startVB.x - dx;
      ctx.viewBox.y = dragging.startVB.y - dy;
      applyViewBox(ctx);
    });
    const endDrag = (e) => {
      if (!dragging) return;
      svg.classList.remove('is-panning');
      try { svg.releasePointerCapture(e.pointerId); } catch (_) {}
      dragging = null;
    };
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);

    // Wheel zoom: only preventDefault when zoomed past 1.0× and intent is
    // clearly to zoom OUT (deltaY < 0 = zoom in, but if at fit and user
    // scrolls down, let the page scroll past the graph).
    svg.addEventListener('wheel', (e) => {
      if (ctx.zoom <= 1.0 && e.deltaY > 0) return; // page scroll wins at fit
      e.preventDefault();
      const rect = stage.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width;
      const my = (e.clientY - rect.top) / rect.height;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomAt(ctx, factor, mx, my);
    }, { passive: false });
  }

  function applyViewBox(ctx) {
    const { svg, viewBox } = ctx;
    svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
    if (ctx.minimapUpdate) ctx.minimapUpdate();
  }

  function zoomAt(ctx, factor, mxFrac, myFrac) {
    const { initialViewBox, viewBox } = ctx;
    const newW = clamp(viewBox.w / factor, initialViewBox.w * 0.15, initialViewBox.w * 4);
    const newH = clamp(viewBox.h / factor, initialViewBox.h * 0.15, initialViewBox.h * 4);
    const worldX = viewBox.x + viewBox.w * mxFrac;
    const worldY = viewBox.y + viewBox.h * myFrac;
    viewBox.x = worldX - newW * mxFrac;
    viewBox.y = worldY - newH * myFrac;
    viewBox.w = newW;
    viewBox.h = newH;
    ctx.zoom = initialViewBox.w / newW;
    applyViewBox(ctx);
  }

  function fitView(ctx) {
    ctx.viewBox = Object.assign({}, ctx.initialViewBox);
    ctx.zoom = 1;
    applyViewBox(ctx);
  }

  function actualSize(ctx) {
    const rect = ctx.stage.getBoundingClientRect();
    const newW = rect.width;
    const newH = rect.height;
    const cx = ctx.viewBox.x + ctx.viewBox.w / 2;
    const cy = ctx.viewBox.y + ctx.viewBox.h / 2;
    ctx.viewBox.w = newW;
    ctx.viewBox.h = newH;
    ctx.viewBox.x = cx - newW / 2;
    ctx.viewBox.y = cy - newH / 2;
    ctx.zoom = ctx.initialViewBox.w / newW;
    applyViewBox(ctx);
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ─── Floating control bar ──────────────────────────────────────────────

  function installControls(ctx) {
    const bar = document.createElement('div');
    bar.className = 'requires-graph-controls';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Requires graph controls');

    const ICON = {
      plus:  '<path d="M12 5v14M5 12h14"/>',
      minus: '<path d="M5 12h14"/>',
      fit:   '<path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/>',
      one:   '<path d="M9 8l3-2v12M8 18h8" stroke-linecap="round"/>',
      full:  '<path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6"/>',
    };

    const mkBtn = (label, title, svgInner, onClick) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'requires-graph-btn';
      b.title = title;
      b.setAttribute('aria-label', title);
      // Explicit width/height attributes (not just CSS) so the SVG renders
      // at 14×14 even when the button lives inside a flex parent. The
      // fullscreen modal's flex layout grants SVGs the 300×150 intrinsic-
      // size default, ignoring CSS width/height. Cherry-picked from
      // bc-knowledge-graph 55eb3de + 28c375d.
      b.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">${svgInner}</svg><span>${label}</span>`;
      b.addEventListener('click', onClick);
      return b;
    };

    bar.appendChild(mkBtn('In',   'Zoom in',     ICON.plus,  () => zoomAt(ctx, 1.25, 0.5, 0.5)));
    bar.appendChild(mkBtn('Out',  'Zoom out',    ICON.minus, () => zoomAt(ctx, 1/1.25, 0.5, 0.5)));
    bar.appendChild(mkBtn('Fit',  'Fit to view', ICON.fit,   () => fitView(ctx)));
    bar.appendChild(mkBtn('1:1',  'Actual size', ICON.one,   () => actualSize(ctx)));
    bar.appendChild(mkBtn('Full', 'Fullscreen',  ICON.full,  () => openFullscreen(ctx)));

    ctx.stage.appendChild(bar);
  }

  // ─── Keyboard focus auto-pan ───────────────────────────────────────────

  function installKeyboardFocusPan(ctx) {
    ctx.svg.addEventListener('focusin', (e) => {
      const node = e.target.closest('g.node');
      if (!node) return;
      panToNode(ctx, node);
    });
  }

  function panToNode(ctx, node) {
    let bbox;
    try { bbox = node.getBBox(); } catch (_) { return; }
    const cx = bbox.x + bbox.width / 2;
    const cy = bbox.y + bbox.height / 2;
    const { viewBox } = ctx;
    const margin = 40;
    const onLeft  = cx < viewBox.x + margin;
    const onRight = cx > viewBox.x + viewBox.w - margin;
    const onTop   = cy < viewBox.y + margin;
    const onBot   = cy > viewBox.y + viewBox.h - margin;
    if (!(onLeft || onRight || onTop || onBot)) return;
    viewBox.x = cx - viewBox.w / 2;
    viewBox.y = cy - viewBox.h / 2;
    applyViewBox(ctx);
  }

  // ─── Minimap (dense only) ──────────────────────────────────────────────

  function installMinimap(ctx) {
    const { svg, stage, initialViewBox } = ctx;
    const mini = document.createElement('div');
    mini.className = 'requires-graph-minimap';
    mini.setAttribute('aria-hidden', 'true');

    const clone = svg.cloneNode(true);
    clone.removeAttribute('id');
    clone.removeAttribute('style');
    clone.setAttribute('viewBox', `${initialViewBox.x} ${initialViewBox.y} ${initialViewBox.w} ${initialViewBox.h}`);
    clone.querySelectorAll('a').forEach((a) => {
      while (a.firstChild) a.parentNode.insertBefore(a.firstChild, a);
      a.remove();
    });
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('class', 'mm-viewport');
    clone.appendChild(rect);

    mini.appendChild(clone);
    stage.appendChild(mini);

    ctx.minimapUpdate = () => {
      rect.setAttribute('x', String(ctx.viewBox.x));
      rect.setAttribute('y', String(ctx.viewBox.y));
      rect.setAttribute('width',  String(ctx.viewBox.w));
      rect.setAttribute('height', String(ctx.viewBox.h));
    };
    ctx.minimapUpdate();

    mini.addEventListener('click', (e) => {
      const r = mini.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width;
      const fy = (e.clientY - r.top)  / r.height;
      const worldX = initialViewBox.x + initialViewBox.w * fx;
      const worldY = initialViewBox.y + initialViewBox.h * fy;
      ctx.viewBox.x = worldX - ctx.viewBox.w / 2;
      ctx.viewBox.y = worldY - ctx.viewBox.h / 2;
      applyViewBox(ctx);
    });
  }

  // ─── Fullscreen modal ──────────────────────────────────────────────────

  function openFullscreen(srcCtx) {
    const dlg = document.createElement('dialog');
    dlg.className = 'requires-graph-modal';
    const fig = srcCtx.figureEl.cloneNode(true);
    fig.querySelectorAll('.requires-graph-controls, .requires-graph-minimap').forEach((el) => el.remove());
    const cloneSvg = fig.querySelector('svg');
    if (cloneSvg) {
      cloneSvg.setAttribute('viewBox', `${srcCtx.initialViewBox.x} ${srcCtx.initialViewBox.y} ${srcCtx.initialViewBox.w} ${srcCtx.initialViewBox.h}`);
      cloneSvg.style.maxWidth = '';
      cloneSvg.style.maxHeight = '';
    }
    dlg.appendChild(fig);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'requires-graph-btn requires-graph-modal-close';
    close.setAttribute('aria-label', 'Close fullscreen');
    close.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M6 18L18 6"/></svg><span>Close</span>';
    close.addEventListener('click', () => dlg.close());
    dlg.appendChild(close);

    document.body.appendChild(dlg);
    document.documentElement.style.overflow = 'hidden';
    dlg.addEventListener('close', () => {
      document.documentElement.style.overflow = '';
      dlg.remove();
    });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');

    mountRequiresGraph(fig);
  }
})();
