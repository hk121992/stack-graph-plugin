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

  function open(id) {
    var it = items[id];
    if (!it) return;
    if (elCode) elCode.textContent = it.code || "";
    if (elBody) elBody.innerHTML = it.html || "";
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

  // Hash → drawer. If the hash IS a sidecar id, open it directly. Otherwise the hash
  // is a deep-link to an element inside a drill target (e.g. a canvas /#H-CP-03 entry
  // anchor that lives in a block cell) — find it, climb to the enclosing [data-popout],
  // and open THAT drawer. The browser still scrolls to the anchor for the no-JS case.
  function openForHash() {
    var h = decodeURIComponent((location.hash || "").slice(1));
    if (!h) return;
    if (items[h]) { open(h); return; }
    var el = document.getElementById(h);
    var host = el && el.closest ? el.closest("[data-popout]") : null;
    if (host) open(host.getAttribute("data-popout"));
  }
  openForHash();
  window.addEventListener("hashchange", openForHash);
})();
