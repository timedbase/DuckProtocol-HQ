// Dependency-free docs engine. content.js defines NAV (the page tree) and PAGES (each page's lede and
// body, written with the component helpers there). This file hash-routes between pages, builds the
// sidebar, table of contents and prev/next links from NAV, upgrades rendered markup (code blocks,
// tables, tabs, heading anchors), and runs client-side search. No build step.

const flat = NAV.flatMap((g, gi) => g.pages.map((p) => ({ ...p, group: g.title, groupIndex: gi })));
const byId = Object.fromEntries(flat.map((p) => [p.id, p]));
const collapsed = new Set();

const $ = (id) => document.getElementById(id);
const slug = (text) => text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function stripHtml(html) {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d.textContent || "";
}

// ------------------------------------------------------------------ sidebar
function renderSidebar(active) {
  $("sidebarNav").innerHTML = NAV.map((g, gi) => {
    const isOpen = gi === active.groupIndex || !collapsed.has(gi);
    return `
      <div class="nav-group${isOpen ? "" : " collapsed"}" data-group="${gi}">
        <button class="nav-group-head" type="button">
          <span class="num">${String(gi + 1).padStart(2, "0")}</span>
          <span class="ttl">${g.title}</span>
          <span class="chev"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 9l6 6 6-6"/></svg></span>
        </button>
        <div class="nav-pages">
          ${g.pages.map((p) => `<a class="page-link${p.id === active.id ? " active" : ""}" href="#/${p.id}">${p.title}<span class="arrow">→</span></a>`).join("")}
        </div>
      </div>`;
  }).join("");
  const current = $("sidebarNav").querySelector(".page-link.active");
  if (current) current.scrollIntoView({ block: "nearest" });
}

$("sidebarNav").addEventListener("click", (e) => {
  const head = e.target.closest(".nav-group-head");
  if (!head) return;
  const group = head.parentElement;
  const gi = Number(group.dataset.group);
  group.classList.toggle("collapsed");
  if (group.classList.contains("collapsed")) collapsed.add(gi); else collapsed.delete(gi);
});

// ------------------------------------------------------------------ enhancements
function copyText(btn, text) {
  navigator.clipboard.writeText(text).then(() => {
    btn.classList.add("done");
    const old = btn.innerHTML;
    btn.textContent = "Copied";
    setTimeout(() => { btn.classList.remove("done"); btn.innerHTML = old; }, 1300);
  }).catch(() => {});
}

function enhance(root) {
  // Every <pre> becomes a labelled code block with a copy button. The label comes from the pre's
  // data-label attribute, if any.
  root.querySelectorAll("pre").forEach((pre) => {
    if (pre.parentElement.classList.contains("codeblock")) return;
    const wrap = document.createElement("div");
    wrap.className = "codeblock";
    const fallback = /^\s*(GET|POST|PUT|DELETE)\s/.test(pre.textContent) ? "http" : "javascript";
    wrap.innerHTML = `<div class="code-head"><span class="lang">${pre.dataset.label || fallback}</span><button class="copy" type="button">Copy</button></div>`;
    pre.replaceWith(wrap);
    wrap.appendChild(pre);
    wrap.querySelector(".copy").addEventListener("click", (e) => copyText(e.currentTarget, pre.textContent));
  });

  root.querySelectorAll("table.data").forEach((table) => {
    if (table.parentElement.classList.contains("table-wrap")) return;
    const wrap = document.createElement("div");
    wrap.className = "table-wrap";
    table.replaceWith(wrap);
    wrap.appendChild(table);
  });

  root.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.classList.add("copy");
    btn.addEventListener("click", () => copyText(btn, btn.getAttribute("data-copy")));
  });

  root.querySelectorAll(".tabs").forEach((tabs) => {
    const buttons = tabs.querySelectorAll(":scope > .tab-list > .tab-btn");
    const panels = tabs.querySelectorAll(":scope > .tab-panel");
    buttons.forEach((btn, i) => btn.addEventListener("click", () => {
      buttons.forEach((b, j) => b.classList.toggle("active", i === j));
      panels.forEach((p, j) => p.classList.toggle("active", i === j));
    }));
  });

  root.querySelectorAll("h2, h3").forEach((h) => {
    if (h.closest(".hero")) return;
    if (!h.id) h.id = slug(h.textContent);
    if (!h.querySelector(".anchor")) h.insertAdjacentHTML("afterbegin", `<a class="anchor" href="#${h.id}" aria-label="Link to this section">#</a>`);
  });

  root.querySelectorAll('a[href^="http"]').forEach((a) => { a.target = "_blank"; a.rel = "noreferrer"; });
}

// ------------------------------------------------------------------ toc + scrollspy
let spy = null;
function renderToc(root, page) {
  const heads = Array.from(root.querySelectorAll("h2, h3")).filter((h) => !h.closest(".hero, .tab-panel:not(.active)"));
  const toc = $("toc");
  const links = heads.map((h) => {
    const label = h.textContent.replace(/^#/, "").trim();
    return `<a href="#${h.id}" class="${h.tagName === "H3" ? "sub" : ""}" data-target="${h.id}">${label}</a>`;
  }).join("");
  toc.innerHTML = (heads.length ? `<div class="toc-title">On this page</div>${links}` : "") + `
    <div class="toc-actions">
      <a href="#/integrate">Integration guide →</a>
      <a href="llms.txt" target="_blank" rel="noreferrer">llms.txt →</a>
    </div>`;

  if (spy) spy.disconnect();
  if (!heads.length) return;
  const byTarget = Object.fromEntries(Array.from(toc.querySelectorAll("a[data-target]")).map((a) => [a.dataset.target, a]));
  spy = new IntersectionObserver((entries) => {
    const visible = entries.filter((en) => en.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (!visible.length) return;
    Object.values(byTarget).forEach((a) => a.classList.remove("active"));
    const link = byTarget[visible[0].target.id];
    if (link) link.classList.add("active");
  }, { rootMargin: "-70px 0px -70% 0px" });
  heads.forEach((h) => spy.observe(h));
}

// In-page anchors (#section) must not be treated as routes.
document.addEventListener("click", (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || a.getAttribute("href").startsWith("#/")) return;
  const target = document.getElementById(a.getAttribute("href").slice(1));
  if (!target) return;
  e.preventDefault();
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  history.replaceState(null, "", location.pathname + location.search + "#/" + currentId + "?s=" + target.id);
});

// ------------------------------------------------------------------ routing
let currentId = null;
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [id, query] = raw.split("?");
  const section = new URLSearchParams(query || "").get("s");
  return { id: id || flat[0].id, section };
}

function renderPageNav(page) {
  const idx = flat.findIndex((p) => p.id === page.id);
  const prev = flat[idx - 1];
  const next = flat[idx + 1];
  return `<nav class="page-nav">
    ${prev ? `<a href="#/${prev.id}"><div class="dir">← Previous</div><div class="ttl">${prev.title}</div></a>` : "<span></span>"}
    ${next ? `<a class="next" href="#/${next.id}"><div class="dir">Next →</div><div class="ttl">${next.title}</div></a>` : ""}
  </nav>`;
}

function render() {
  const { id, section } = parseHash();
  const page = byId[id] || flat[0];
  const sameP = page.id === currentId;
  currentId = page.id;
  const root = $("content");
  if (!sameP) {
    root.innerHTML = `
      <header class="page-head">
        <div class="eyebrow">${page.group}</div>
        <h1>${page.title}</h1>
        ${page.lede ? `<p class="lede">${page.lede}</p>` : ""}
      </header>
      ${page.body}
      ${renderPageNav(page)}`;
    enhance(root);
    renderSidebar(page);
    renderToc(root, page);
    document.title = `${page.title} · duckpad docs`;
  }
  closeMenu();
  const target = section && document.getElementById(section);
  if (target) target.scrollIntoView({ block: "start" });
  else if (!sameP) window.scrollTo({ top: 0 });
}

// ------------------------------------------------------------------ search
const searchInput = $("searchInput");
const searchResults = $("searchResults");
const index = flat.map((p) => {
  const text = (p.title + " " + stripHtml(p.lede || "") + " " + stripHtml(p.body)).replace(/\s+/g, " ");
  return { ...p, text, lower: text.toLowerCase() };
});
let selIdx = -1;
let matches = [];

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function snippet(entry, query) {
  const at = entry.lower.indexOf(query);
  if (at < 0) return escapeHtml(stripHtml(entry.lede || "").slice(0, 90));
  const start = Math.max(0, at - 40);
  const raw = entry.text.slice(start, at + query.length + 60);
  const hit = raw.toLowerCase().indexOf(query);
  return (start > 0 ? "…" : "") + escapeHtml(raw.slice(0, hit)) + "<mark>" + escapeHtml(raw.slice(hit, hit + query.length)) + "</mark>" + escapeHtml(raw.slice(hit + query.length));
}

function runSearch(q) {
  const query = q.trim().toLowerCase();
  if (!query) { searchResults.classList.remove("show"); matches = []; return; }
  matches = index
    .filter((p) => p.lower.includes(query))
    .sort((a, b) => Number(b.title.toLowerCase().includes(query)) - Number(a.title.toLowerCase().includes(query)))
    .slice(0, 8);
  selIdx = matches.length ? 0 : -1;
  searchResults.innerHTML = matches.length
    ? matches.map((p, i) => `<div class="res${i === selIdx ? " sel" : ""}" data-id="${p.id}"><div class="g">${p.group}</div><div class="t">${p.title}</div><div class="x">${snippet(p, query)}</div></div>`).join("")
    : `<div class="empty">No results for “${escapeHtml(q)}”</div>`;
  searchResults.classList.add("show");
}

function highlightSel() {
  searchResults.querySelectorAll(".res").forEach((r, i) => r.classList.toggle("sel", i === selIdx));
}
function go(id) {
  location.hash = "#/" + id;
  searchInput.value = "";
  searchResults.classList.remove("show");
  searchInput.blur();
}

searchInput.addEventListener("input", (e) => runSearch(e.target.value));
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { e.preventDefault(); selIdx = Math.min(selIdx + 1, matches.length - 1); highlightSel(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); selIdx = Math.max(selIdx - 1, 0); highlightSel(); }
  else if (e.key === "Enter" && matches[selIdx]) go(matches[selIdx].id);
  else if (e.key === "Escape") { searchResults.classList.remove("show"); searchInput.blur(); }
});
searchResults.addEventListener("click", (e) => {
  const res = e.target.closest(".res");
  if (res) go(res.dataset.id);
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-wrap")) searchResults.classList.remove("show");
});
document.addEventListener("keydown", (e) => {
  const typing = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
  if (e.key === "/" && !typing) { e.preventDefault(); searchInput.focus(); }
});

// ------------------------------------------------------------------ mobile menu
function closeMenu() {
  $("sidebar").classList.remove("open");
  $("scrim").classList.remove("show");
}
$("menuBtn").addEventListener("click", () => {
  const open = !$("sidebar").classList.contains("open");
  $("sidebar").classList.toggle("open", open);
  $("scrim").classList.toggle("show", open);
});
$("scrim").addEventListener("click", closeMenu);

window.addEventListener("hashchange", render);
render();
