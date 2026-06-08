// Handbook search — wires the topbar .search box to the Pagefind index.
//
// Reuses the vendored .search / .search-results CSS (so it follows light/dark via
// the theme tokens). The index is built at /pagefind/ over the handbook glob (see
// the harness build wiring); result URLs are already site-absolute (/handbook/...).
// Pagefind is lazy-loaded on first interaction so it costs nothing until used.
(function () {
  var form = document.querySelector("form.search");
  var input = form && form.querySelector("input");
  var panel = document.querySelector(".search-results");
  if (!input || !panel) return;

  var pf = null;          // the loaded pagefind module
  var loading = null;     // in-flight load promise
  var debounce = null;
  var seq = 0;            // guards against out-of-order async renders

  function ensurePagefind() {
    if (pf) return Promise.resolve(pf);
    if (loading) return loading;
    loading = import("/pagefind/pagefind.js")
      .then(function (mod) { pf = mod; return pf; })
      .catch(function (e) { loading = null; throw e; });
    return loading;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function close() { panel.hidden = true; panel.innerHTML = ""; }

  function render(items) {
    if (!items.length) {
      panel.innerHTML = '<div class="search-result"><div class="search-result-excerpt">No results.</div></div>';
      panel.hidden = false;
      return;
    }
    panel.innerHTML = items.map(function (d) {
      var title = (d.meta && d.meta.title) ? d.meta.title : d.url;
      // pagefind excerpts contain <mark> highlight tags — keep those, escape the rest is
      // already handled by pagefind (it returns safe HTML for the excerpt).
      return '<a class="search-result" href="' + esc(d.url) + '">' +
        '<div class="search-result-title">' + esc(title) + '</div>' +
        '<div class="search-result-excerpt">' + d.excerpt + '</div></a>';
    }).join("");
    panel.hidden = false;
  }

  function run(q) {
    var mine = ++seq;
    if (!q || q.length < 2) { close(); return; }
    ensurePagefind()
      .then(function (lib) { return lib.search(q); })
      .then(function (search) {
        return Promise.all(search.results.slice(0, 8).map(function (r) { return r.data(); }));
      })
      .then(function (data) { if (mine === seq) render(data); })
      .catch(function (e) {
        if (mine !== seq) return;
        console.error("[search] pagefind unavailable:", e);
        panel.innerHTML = '<div class="search-result"><div class="search-result-excerpt">Search is unavailable.</div></div>';
        panel.hidden = false;
      });
  }

  input.addEventListener("input", function () {
    clearTimeout(debounce);
    var q = input.value.trim();
    debounce = setTimeout(function () { run(q); }, 180);
  });
  input.addEventListener("focus", function () { ensurePagefind().catch(function () {}); });
  input.addEventListener("keydown", function (e) { if (e.key === "Escape") { close(); input.blur(); } });
  document.addEventListener("click", function (e) {
    if (panel.hidden) return;
    if (e.target === input || panel.contains(e.target)) return;
    close();
  });
})();
