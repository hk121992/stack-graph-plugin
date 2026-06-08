// popout.js — a generic right-hand detail drawer (modelled on be-civic's bmd
// side panel). Any element with [data-popout="<id>"] opens the drawer and shows
// the pre-rendered detail HTML for <id> from the page's #popout-data sidecar.
// Deep-linkable via the URL hash. CSP-safe (external script, no inline handlers).
(function () {
  "use strict";
  var dataEl = document.getElementById("popout-data");
  var aside = document.querySelector(".popout");
  if (!dataEl || !aside) return;
  var items = {};
  try { items = (JSON.parse(dataEl.textContent) || {}).items || {}; } catch (e) { return; }

  var elCode = aside.querySelector(".popout-code");
  var elBody = aside.querySelector(".popout-body");
  var lastFocus = null;

  // own-property lookup: a hash of #__proto__ / #constructor would otherwise read a
  // truthy Object.prototype member and open an empty drawer. Guard every items[] access.
  function has(id) { return Object.prototype.hasOwnProperty.call(items, id); }

  function open(id) {
    if (!has(id)) return;
    var it = items[id];
    if (!it) return;
    if (elCode) elCode.textContent = it.code || "";
    if (elBody) elBody.innerHTML = it.html || "";
    // data-kind drives the drawer width (work-item drawers are wider — they carry the
    // throughline + gates + timeline + child IUs). Canvas sidecar items carry no kind.
    aside.setAttribute("data-kind", it.kind || "");
    aside.setAttribute("data-open", "true");
    aside.setAttribute("aria-hidden", "false");
    if (decodeURIComponent((location.hash || "").slice(1)) !== id) {
      history.replaceState(null, "", "#" + encodeURIComponent(id));
    }
    var closeBtn = aside.querySelector(".popout-close");
    if (closeBtn) closeBtn.focus();
  }
  function close() {
    aside.setAttribute("data-open", "false");
    aside.setAttribute("aria-hidden", "true");
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  document.addEventListener("click", function (e) {
    var trigger = e.target.closest("[data-popout]");
    if (trigger) { e.preventDefault(); lastFocus = trigger; open(trigger.getAttribute("data-popout")); return; }
    if (e.target.closest("[data-close]")) close();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && aside.getAttribute("data-open") === "true") close();
    // Enter/Space on a focused card opens it (keyboard access).
    if ((e.key === "Enter" || e.key === " ")) {
      var t = e.target.closest && e.target.closest("[data-popout]");
      if (t) { e.preventDefault(); lastFocus = t; open(t.getAttribute("data-popout")); }
    }
  });

  // Hash → drawer / accordion. Resolution order (D65):
  //   1. a canvas cv-anchor (the cross-surface "open in canvas" target) → climb to the
  //      enclosing block cell and open ITS drawer. This wins over (2): in production each
  //      page has its OWN #popout-data, so a bet id is only a sidecar key on the dashboard
  //      and only an anchor on the canvas — no collision — but resolving the anchor first
  //      is the robust order (a page carrying both would still land on the canvas block).
  //   2. a sidecar id → open that drawer directly (work-item / IU / bet).
  //   3. a <details> → open + scroll (the objective-accordion deep-link, the ~4-line shim).
  //   4. else climb to the enclosing [data-popout] and open it.
  function openForHash() {
    var h = decodeURIComponent((location.hash || "").slice(1));
    if (!h) return;
    var el = document.getElementById(h);
    if (el && el.classList && el.classList.contains("cv-anchor")) {
      var hostCv = el.closest ? el.closest("[data-popout]") : null;
      if (hostCv) { open(hostCv.getAttribute("data-popout")); return; }
    }
    if (has(h)) { open(h); return; }
    if (!el) return;
    if (el.tagName === "DETAILS") { el.open = true; el.scrollIntoView({ block: "center" }); return; }
    var host = el.closest ? el.closest("[data-popout]") : null;
    if (host) open(host.getAttribute("data-popout"));
  }
  openForHash();
  window.addEventListener("hashchange", openForHash);
})();
