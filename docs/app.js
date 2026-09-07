// Tiny, dependency-free docs engine: hash-routes between pages defined in
// content.js, builds the sidebar/TOC/prev-next from that same NAV tree (one
// source of truth, no duplicated page lists), and does a plain client-side
// substring search across title+text. No build step -- open index.html or
// serve the directory as-is.

const flat = NAV.flatMap((g) => g.pages.map((p) => ({ ...p, group: g.title })));
const byId = Object.fromEntries(flat.map((p) => [p.id, p]));

function renderSidebar(activeId) {
  const el = document.getElementById("sidebar");
  el.innerHTML = NAV.map((g) => `
    <div class="sidebar-group">
      <div class="sidebar-group-title">${g.title}</div>
      ${g.pages.map((p) => `<a class="page-link${p.id === activeId ? " active" : ""}" href="#/${p.id}">${p.title}</a>`).join("")}
    </div>
  `).join("");
}

function renderToc(contentEl) {
  const heads = Array.from(contentEl.querySelectorAll("h2, h3"));
  const toc = document.getElementById("toc");
  if (heads.length === 0) { toc.innerHTML = ""; return; }
  toc.innerHTML = `<div class="toc-title">On this page</div>` + heads.map((h) => {
    if (!h.id) h.id = h.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    return `<a href="#${h.id}" class="${h.tagName === "H3" ? "sub" : ""}" data-target="${h.id}">${h.textContent}</a>`;
  }).join("");
}

function renderPageNav(activeId) {
  const idx = flat.findIndex((p) => p.id === activeId);
  const prev = idx > 0 ? flat[idx - 1] : null;
  const next = idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : null;
  if (!prev && !next) return "";
  return `<div class="page-nav">
    ${prev ? `<a href="#/${prev.id}"><div class="dir">← Previous</div><div class="ttl">${prev.title}</div></a>` : "<div></div>"}
    ${next ? `<a href="#/${next.id}" class="next"><div class="dir">Next →</div><div class="ttl">${next.title}</div></a>` : ""}
  </div>`;
}

function stripHtml(html) {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d.textContent || "";
}

function render() {
  const id = (location.hash.replace(/^#\/?/, "")) || NAV[0].pages[0].id;
  const page = byId[id] || flat[0];
  const contentEl = document.getElementById("content");
  contentEl.innerHTML = `
    <div class="crumb">${page.group}</div>
    <h1>${page.title}</h1>
    ${page.lede ? `<p class="lede">${page.lede}</p>` : ""}
    ${page.body}
    ${renderPageNav(page.id)}
  `;
  renderSidebar(page.id);
  renderToc(contentEl);
  wireCopyButtons(contentEl);
  document.getElementById("sidebar").classList.remove("open");
  window.scrollTo({ top: 0 });
  document.title = `${page.title} · DuckProtocol Docs`;
}

function wireCopyButtons(root) {
  root.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(btn.getAttribute("data-copy"));
        const old = btn.textContent;
        btn.textContent = "Copied";
        setTimeout(() => (btn.textContent = old), 1200);
      } catch {}
    });
  });
}

// ---- search ----
const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");
const index = flat.map((p) => ({ ...p, text: (p.title + " " + stripHtml(p.lede || "") + " " + stripHtml(p.body)).toLowerCase() }));
let selIdx = -1;
let currentMatches = [];

function runSearch(q) {
  const query = q.trim().toLowerCase();
  if (!query) { searchResults.classList.remove("show"); currentMatches = []; return; }
  currentMatches = index.filter((p) => p.text.includes(query)).slice(0, 8);
  selIdx = -1;
  if (currentMatches.length === 0) {
    searchResults.innerHTML = `<div class="empty">No results for "${q}"</div>`;
  } else {
    searchResults.innerHTML = currentMatches.map((p, i) =>
      `<div class="res" data-id="${p.id}" data-idx="${i}"><div class="g">${p.group}</div><div class="t">${p.title}</div></div>`
    ).join("");
  }
  searchResults.classList.add("show");
}

searchInput.addEventListener("input", (e) => runSearch(e.target.value));
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { e.preventDefault(); selIdx = Math.min(selIdx + 1, currentMatches.length - 1); highlightSel(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); selIdx = Math.max(selIdx - 1, 0); highlightSel(); }
  else if (e.key === "Enter" && currentMatches[selIdx]) { navigateTo(currentMatches[selIdx].id); }
  else if (e.key === "Escape") { searchResults.classList.remove("show"); searchInput.blur(); }
});
function highlightSel() {
  searchResults.querySelectorAll(".res").forEach((r, i) => r.classList.toggle("sel", i === selIdx));
}
searchResults.addEventListener("click", (e) => {
  const res = e.target.closest(".res");
  if (res) navigateTo(res.getAttribute("data-id"));
});
function navigateTo(id) {
  location.hash = "#/" + id;
  searchInput.value = "";
  searchResults.classList.remove("show");
}
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-wrap")) searchResults.classList.remove("show");
});
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== searchInput) { e.preventDefault(); searchInput.focus(); }
});

// ---- mobile sidebar toggle ----
document.getElementById("menuBtn").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("open");
});

window.addEventListener("hashchange", render);
render();
