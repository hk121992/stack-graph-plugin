/* Graph-browser progressive enhancement layer (stack-graph A3b-3).
 *
 * Forked from bc-renderer-core/assets/graph-viewer.js. Differences:
 *   - indexes nodes by `data-node-id` (the original keyed on `data-skill-id`);
 *   - KEEPS pan/zoom, hover path-highlight, minimap, fullscreen, keyboard
 *     focus-pan — unchanged behaviour;
 *   - ADDS a click handler on g.node[data-node-id] that reads the
 *     <script type="application/json" id="graph-data"> sidecar and populates +
 *     un-hides #graph-sidebar with the node's detail (id, kind, goals, in/out
 *     edges, health badges, file link), plus a close button.
 *
 * Self-contained IIFE, no imports. The SVG is post-processed at build time
 * (build-graph.ts) — this script does no DOM rewriting beyond mounting controls,
 * managing viewBox state, and the sidebar.
 */

(function () {
  'use strict';

  var FIGURE_CLASSES = ['requires-graph', 'domain-diagram'];

  function init() {
    var selector = FIGURE_CLASSES.map(function (c) { return 'figure.' + c; }).join(',');
    document.querySelectorAll(selector).forEach(function (fig) {
      try { mountRequiresGraph(fig); }
      catch (err) { console.warn('[graph-browser] mount failed', err); }
    });
    try { initSidebar(); }
    catch (err) { console.warn('[graph-browser] sidebar init failed', err); }
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
      _pinnedNodeId: null,
    };
    figureEl.__sgCtx = ctx;   // so the sidebar's click handler can pin the lineage

    installPathHighlight(ctx);

    if (tier === 'compact') return ctx;

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
    const nodes = ctx.svg.querySelectorAll('g.node[data-node-id]');
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
    const targetId = targetNode.getAttribute('data-node-id');
    if (!targetId) return;
    // Highlight both ancestors (incoming) and descendants (outgoing) so the
    // node's whole lineage in the graph lights up.
    const activeNodeIds = new Set([targetId]);
    const activeEdges = new Set();

    // ancestors
    let queue = [targetId];
    while (queue.length) {
      const id = queue.shift();
      const parents = ctx.edgeIndex.byTo.get(id) || [];
      for (const { parent, edgeEl } of parents) {
        activeEdges.add(edgeEl);
        if (!activeNodeIds.has(parent)) { activeNodeIds.add(parent); queue.push(parent); }
      }
    }
    // descendants
    queue = [targetId];
    const seenDown = new Set([targetId]);
    while (queue.length) {
      const id = queue.shift();
      const children = ctx.edgeIndex.byFrom.get(id) || [];
      for (const { child, edgeEl } of children) {
        activeEdges.add(edgeEl);
        activeNodeIds.add(child);
        if (!seenDown.has(child)) { seenDown.add(child); queue.push(child); }
      }
    }

    ctx.figureEl.classList.add('is-highlighting');
    ctx.svg.querySelectorAll('g.node').forEach((n) => {
      n.classList.toggle('path-active', activeNodeIds.has(n.getAttribute('data-node-id')));
    });
    ctx.svg.querySelectorAll('g.edge').forEach((e) => {
      e.classList.toggle('path-active', activeEdges.has(e));
    });
  }

  function clearHighlight(ctx) {
    // If a node is pinned (clicked/selected), keep its lineage lit rather than
    // clearing — so the traces stay live while the user reads the drawer.
    if (ctx._pinnedNodeId) {
      const pinned = ctx.svg.querySelector('g.node[data-node-id="' + cssEscape(ctx._pinnedNodeId) + '"]');
      if (pinned) { highlightLineage(ctx, pinned); return; }
    }
    ctx.figureEl.classList.remove('is-highlighting');
    ctx.svg.querySelectorAll('.path-active').forEach((el) => el.classList.remove('path-active'));
  }

  // ─── Pan/zoom (viewBox math, no library) ────────────────────────────────

  function installPanZoom(ctx) {
    const { svg, stage } = ctx;
    applyViewBox(ctx);

    let dragging = null;
    let moved = false;
    svg.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return; // primary button only
      dragging = { startX: e.clientX, startY: e.clientY, startVB: Object.assign({}, ctx.viewBox), captured: false, pid: e.pointerId };
      moved = false;
      ctx._pointerRecent = true; // suppress focus-auto-pan for this pointer gesture
      // Do NOT capture the pointer here. Capturing on a plain click retargets the
      // follow-up `click` event to the <svg>, so e.target.closest('g.node') is null
      // and the node-click → detail drawer silently breaks. Capture only once the
      // gesture is actually a drag (past the threshold, below).
    });
    svg.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const rect = stage.getBoundingClientRect();
      if (!moved && (Math.abs(e.clientX - dragging.startX) > 3 || Math.abs(e.clientY - dragging.startY) > 3)) {
        moved = true;
        svg.classList.add('is-panning');
        try { svg.setPointerCapture(dragging.pid); dragging.captured = true; } catch (_) {}
      }
      if (!moved) return; // a sub-threshold jiggle is a click, not a pan
      const dx = (e.clientX - dragging.startX) * (ctx.viewBox.w / rect.width);
      const dy = (e.clientY - dragging.startY) * (ctx.viewBox.h / rect.height);
      ctx.viewBox.x = dragging.startVB.x - dx;
      ctx.viewBox.y = dragging.startVB.y - dy;
      applyViewBox(ctx);
    });
    const endDrag = () => {
      if (!dragging) return;
      svg.classList.remove('is-panning');
      if (dragging.captured) { try { svg.releasePointerCapture(dragging.pid); } catch (_) {} }
      svg.__sgDragged = moved;
      dragging = null;
      // Keep suppressing focus-pan briefly: the click + its focus fire just after pointerup.
      setTimeout(function () { ctx._pointerRecent = false; }, 400);
    };
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);
    // Expose whether the last pointer interaction was a drag, so the click
    // handler can ignore drags (avoids opening the sidebar after a pan).
    ctx._wasDragged = () => moved;

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
    bar.setAttribute('aria-label', 'Graph controls');

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
      if (ctx._pointerRecent) return; // a click/drag focus — never auto-pan on pointer
      const node = e.target.closest('g.node');
      if (!node) return;
      panToNode(ctx, node);
    });
  }

  function panToNode(ctx, node) {
    var bbox, ctm;
    try { bbox = node.getBBox(); ctm = node.getCTM(); } catch (_) { return; }
    if (!ctm || !ctx.svg.createSVGPoint) return;
    // Map the node centre from its (graphviz-transformed, negative-Y) LOCAL space
    // into the SVG viewBox coordinate system. Using raw getBBox coords against the
    // viewBox was the bug that panned the graph off-screen on focus.
    var p = ctx.svg.createSVGPoint();
    p.x = bbox.x + bbox.width / 2;
    p.y = bbox.y + bbox.height / 2;
    var c = p.matrixTransform(ctm);
    var vb = ctx.viewBox;
    var margin = 40;
    var off = c.x < vb.x + margin || c.x > vb.x + vb.w - margin || c.y < vb.y + margin || c.y > vb.y + vb.h - margin;
    if (!off) return;
    vb.x = c.x - vb.w / 2;
    vb.y = c.y - vb.h / 2;
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

  // ─── Detail sidebar (NEW — the graph-browser addition) ──────────────────

  function loadSidecar() {
    const el = document.getElementById('graph-data');
    if (!el) return {};
    try { return JSON.parse(el.textContent || '{}'); }
    catch (err) { console.warn('[graph-browser] bad #graph-data JSON', err); return {}; }
  }

  // Edge-type → accent colour (mirrors build-graph.ts EDGE_STYLE for the chips).
  var EDGE_COLOR = {
    'invokes': '#3b6fb0', 'references': '#7a7872', 'composes-into': '#9b8b1f',
    'precedes': '#2e9e5b', 'can-follow': '#d9a514', 'maintains': '#b06a3b',
    'overlay': '#8a5bd6', 'loads': '#3b6fb0', 'triggers': '#d64545', 'seed-next': '#d9a514',
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function healthDot(state) {
    var s = state || 'unknown';
    return '<span class="health-key health-' + esc(s) + '" title="' + esc(s) + '"></span>';
  }

  function edgeListHtml(edges, dir) {
    if (!edges || !edges.length) return '<p class="gs-empty">none</p>';
    var items = edges.map(function (e) {
      var color = EDGE_COLOR[e.type] || '#8a8884';
      var meta = [];
      if (e.stage) meta.push('stage: ' + e.stage);
      if (e.load) meta.push('load: ' + e.load);
      var external = e.external ? ' is-external' : '';
      var extTag = e.external ? ' <span class="gs-edge-meta">(external)</span>' : '';
      return '<li>' +
        '<span class="gs-edge-type" style="--edge-c:' + color + '">' + esc(e.type) + '</span>' +
        '<span class="gs-edge-target' + external + '">' + esc(e.id) + '</span>' +
        (meta.length ? ' <span class="gs-edge-meta">' + esc(meta.join(' · ')) + '</span>' : '') +
        extTag +
        '</li>';
    }).join('');
    return '<ul class="gs-edges">' + items + '</ul>';
  }

  function renderDetail(node) {
    var goalsHtml = (node.goals && node.goals.length)
      ? node.goals.map(function (g) {
          return '<div class="gs-goal">' + esc(g.outcome || '') +
            (g.metric ? '<div class="gs-metric">metric: ' + esc(g.metric) + '</div>' : '') +
            '</div>';
        }).join('')
      : '<p class="gs-empty">none recorded</p>';

    var lu = (node.health && node.health.last_updated) || {};
    var us = (node.health && node.health.last_used) || {};
    var luLabel = lu.iso ? new Date(lu.iso).toISOString().slice(0, 10) : (lu.state || 'unknown');

    var fileHtml = node.file
      ? '<p class="gs-file"><code>' + esc(node.file) + '</code></p>'
      : '<p class="gs-empty">no file</p>';

    return '' +
      '<h2 class="gs-id">' + esc(node.id) + '</h2>' +
      '<span class="gs-kind">' + esc(node.kind || 'node') + '</span>' +
      (node.title && node.title !== node.id ? '<p><strong>' + esc(node.title) + '</strong></p>' : '') +
      (node.description ? '<p>' + esc(node.description) + '</p>' : '') +

      '<div class="gs-section-title">Health</div>' +
      '<div class="gs-health">' +
        '<span class="gs-h">' + healthDot(lu.state) + 'last-updated: ' + esc(luLabel) + '</span>' +
        '<span class="gs-h">' + healthDot(us.state) + 'last-used: ' + esc(us.state || 'unknown') + '</span>' +
      '</div>' +
      (us.note ? '<p class="gs-edge-meta">' + esc(us.note) + '</p>' : '') +

      '<div class="gs-section-title">Goals</div>' + goalsHtml +

      '<div class="gs-section-title">Edges out (' + (node.edges_out ? node.edges_out.length : 0) + ')</div>' +
      edgeListHtml(node.edges_out, 'out') +

      '<div class="gs-section-title">Edges in (' + (node.edges_in ? node.edges_in.length : 0) + ')</div>' +
      edgeListHtml(node.edges_in, 'in') +

      '<div class="gs-section-title">File</div>' + fileHtml +

      ((node.directory && node.directory.length)
        ? '<div class="gs-section-title">Directory</div><ul class="gs-dir">' +
          node.directory.map(function (d) {
            return '<li><code>' + esc(d.name) + '</code>' +
              (d.role ? ' <span class="gs-role">— ' + esc(d.role) + '</span>' : '') + '</li>';
          }).join('') + '</ul>'
        : '') +

      (node.document_html
        ? '<div class="gs-section-title">Document</div><div class="gs-doc">' + node.document_html + '</div>'
        : '');
  }

  function initSidebar() {
    var sidebar = document.getElementById('graph-sidebar');
    var body = document.getElementById('graph-sidebar-body');
    var closeBtn = document.getElementById('graph-sidebar-close');
    if (!sidebar || !body) return;

    var data = loadSidecar();

    function open(id) {
      var node = data[id];
      if (!node) return;
      body.innerHTML = renderDetail(node);
      sidebar.hidden = false;
      sidebar.classList.add('is-open');
      // mark the active node in the SVG
      document.querySelectorAll('g.node.is-selected').forEach(function (n) { n.classList.remove('is-selected'); });
      document.querySelectorAll('g.node[data-node-id="' + cssEscape(id) + '"]').forEach(function (n) { n.classList.add('is-selected'); });
      // Pin the lineage highlight to the selected node so the traces stay lit while
      // the drawer is open (restored after hover, cleared on close / re-select).
      document.querySelectorAll('figure.requires-graph').forEach(function (fig) {
        var ctx = fig.__sgCtx; if (!ctx) return;
        var n = fig.querySelector('g.node[data-node-id="' + cssEscape(id) + '"]');
        if (n) { ctx._pinnedNodeId = id; highlightLineage(ctx, n); }
      });
      // preventScroll: focusing the (fixed) close button must never scroll the page
      // to the top — that was the "jumps to top" symptom.
      if (closeBtn) { try { closeBtn.focus({ preventScroll: true }); } catch (_) { closeBtn.focus(); } }
    }
    function close() {
      sidebar.hidden = true;
      sidebar.classList.remove('is-open');
      document.querySelectorAll('g.node.is-selected').forEach(function (n) { n.classList.remove('is-selected'); });
      // Unpin + clear the lineage highlight.
      document.querySelectorAll('figure.requires-graph').forEach(function (fig) {
        var ctx = fig.__sgCtx; if (!ctx) return;
        ctx._pinnedNodeId = null;
        clearHighlight(ctx);
      });
    }

    if (closeBtn) closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !sidebar.hidden) close(); });
    // Click-away: dismiss the open drawer when clicking outside it. A click on a
    // node opens/switches detail (handled below), so it is excluded here; anything
    // else — the canvas background, the page body — closes the drawer.
    document.addEventListener('click', function (e) {
      if (sidebar.hidden) return;
      if (sidebar.contains(e.target)) return;
      if (e.target.closest && e.target.closest('g.node[data-node-id]')) return;
      close();
    });

    // Delegate clicks on node groups. Ignore clicks that were the tail of a
    // pan-drag (the pan handler sets a movement flag on the svg element).
    document.querySelectorAll('figure.requires-graph svg').forEach(function (svg) {
      // Record the node under the pointer at PRESS time — before any pointer capture
      // (or SVG event quirk) can retarget the follow-up click to the <svg>. This is
      // the reliable signal for which node was clicked.
      svg.addEventListener('pointerdown', function (e) {
        svg.__pressNode = (e.target && e.target.closest) ? e.target.closest('g.node[data-node-id]') : null;
      });
      svg.addEventListener('click', function (e) {
        if (svg.__sgDragged) { svg.__sgDragged = false; return; } // ignore the click that ends a pan
        // Prefer the click target; fall back to the press-time node, then a hit-test.
        var node = (e.target.closest && e.target.closest('g.node[data-node-id]')) || svg.__pressNode;
        if (!node && e.clientX != null) {
          var el = document.elementFromPoint(e.clientX, e.clientY);
          node = el && el.closest ? el.closest('g.node[data-node-id]') : null;
        }
        if (!node) return;
        var id = node.getAttribute('data-node-id');
        if (id) open(id);
      });
      // Keyboard: Enter/Space on a focused node opens detail.
      svg.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var node = e.target.closest('g.node[data-node-id]');
        if (!node) return;
        e.preventDefault();
        var id = node.getAttribute('data-node-id');
        if (id) open(id);
      });
    });
  }

  // Minimal CSS.escape fallback (attribute-selector safe for our slug ids).
  function cssEscape(s) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(s);
    return String(s).replace(/["\\\]]/g, '\\$&');
  }
})();
