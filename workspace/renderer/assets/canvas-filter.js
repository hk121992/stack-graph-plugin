// canvas-filter.js — evidence-state filter for the strategy canvas.
//
// The legend pills are toggle buttons (data-ev-toggle="<state>", aria-pressed).
// Clicking one shows/hides every canvas entry of that state: it flips aria-pressed
// and toggles `cv-hide-<state>` on .cv-root, which the surface CSS uses to hide
// matching li[data-ev="<state>"]. CSP-safe (external, no inline handlers).
(function () {
  "use strict";
  var root = document.querySelector(".cv-root");
  var toggles = document.querySelectorAll("[data-ev-toggle]");
  if (!root || !toggles.length) return;

  function apply(state, on) {
    root.classList.toggle("cv-hide-" + state, !on);
  }

  toggles.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var state = btn.getAttribute("data-ev-toggle");
      var on = btn.getAttribute("aria-pressed") !== "true"; // flip
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      apply(state, on);
    });
  });
})();
