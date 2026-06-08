
(function () {
  var btn = document.querySelector(".theme-toggle");
  var ham = document.querySelector(".nav-hamburger");
  var sb = document.getElementById("sidebar");
  var backdrop = document.querySelector(".drawer-backdrop");

  function apply(theme) {
    var dark;
    if (theme === "dark") dark = true;
    else if (theme === "light") dark = false;
    else dark = matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.classList.toggle("light", !dark);
  }

  if (btn) {
    btn.addEventListener("click", function () {
      var current = localStorage.getItem("becivic_theme") || "system";
      var next =
        current === "system" ? "light" : current === "light" ? "dark" : "system";
      if (next === "system") localStorage.removeItem("becivic_theme");
      else localStorage.setItem("becivic_theme", next);
      apply(next);
    });
  }

  function setDrawer(open) {
    sb.classList.toggle("open", open);
    ham.setAttribute("aria-expanded", open ? "true" : "false");
    if (backdrop) backdrop.hidden = !open;
  }
  if (ham && sb) {
    ham.addEventListener("click", function () { setDrawer(!sb.classList.contains("open")); });
    if (backdrop) backdrop.addEventListener("click", function () { setDrawer(false); });
  }

  // Smooth-scroll for in-page anchors (TOC, refs).
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute("href").slice(1);
    if (!id) return;
    var t = document.getElementById(id);
    if (!t) return;
    e.preventDefault();
    t.scrollIntoView({ behavior: "smooth", block: "start" });
    history.pushState(null, "", "#" + id);
  });

  // TOC active-section tracking via IntersectionObserver.
  (function () {
    var toc = document.querySelector(".toc");
    if (!toc || !("IntersectionObserver" in window)) return;
    var article = document.querySelector(".content");
    if (!article) return;
    var headings = article.querySelectorAll("h2[id], h3[id]");
    if (!headings.length) return;
    var visible = new Map();
    function refresh() {
      var top = null, topY = Infinity;
      visible.forEach(function (y, id) { if (y < topY) { topY = y; top = id; } });
      toc.querySelectorAll("a.active").forEach(function (a) { a.classList.remove("active"); });
      if (top) {
        var link = toc.querySelector('a[href="#' + CSS.escape(top) + '"]');
        if (link) link.classList.add("active");
      }
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top);
        else visible.delete(e.target.id);
      });
      refresh();
    }, { rootMargin: "-72px 0px -70% 0px", threshold: 0 });
    headings.forEach(function (h) { io.observe(h); });
  })();

  // Copy-to-clipboard buttons on callout-tip prompts.
  document.querySelectorAll(".callout-tip pre").forEach(function (pre) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy-btn";
    btn.setAttribute("aria-label", "Copy prompt to clipboard");
    btn.textContent = "Copy";
    btn.addEventListener("click", function () {
      var code = pre.querySelector("code");
      var text = (code ? code.textContent : pre.textContent) || "";
      navigator.clipboard.writeText(text.trim()).then(function () {
        btn.textContent = "Copied";
        btn.classList.add("copied");
        setTimeout(function () {
          btn.textContent = "Copy";
          btn.classList.remove("copied");
        }, 1600);
      }).catch(function () {
        btn.textContent = "Failed";
        setTimeout(function () { btn.textContent = "Copy"; }, 1600);
      });
    });
    pre.appendChild(btn);
  });
})();
