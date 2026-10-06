// Builds a readable, filterable page from docs/feature-comparison.md.
//
//   node scripts/build-features-html.js [output-file]
//
// The markdown stays the source of truth. Output (default
// docs/feature-comparison.html, git-ignored) is one self-contained file: tables
// grouped by area, a Where filter (All / Both / Desktop only / Phone only) and a
// text search. Handles only what that file uses: # and ## headings, pipe tables,
// paragraphs, bullets, `code`, **bold**, *italic*.

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const md = fs.readFileSync(path.join(root, "docs", "feature-comparison.md"), "utf8").replace(/\r\n/g, "\n");
const outPath = path.resolve(process.argv[2] || path.join(root, "docs", "feature-comparison.html"));

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function inline(text) {
  const codes = [];
  let s = String(text).replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?![*\w])/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
}

const cells = (line) => line.replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
const mark = (v) => (v === "✔" ? '<span class="yes" title="Has it">✔</span>' : v === "◐" ? '<span class="part" title="Part of it">◐</span>' : '<span class="no" title="Does not">—</span>');
const whereClass = (w) => (w === "Both" ? "both" : w === "Desktop only" ? "desk" : w === "Phone only" ? "phone" : "");

const lines = md.split("\n");
const body = [];
let title = "Desktop and phone";
let lead = "";
let counts = { both: 0, desk: 0, phone: 0 };
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (/^# /.test(line)) { title = line.slice(2); continue; }
  if (/^## /.test(line)) { body.push(`<h2>${inline(line.slice(3))}</h2>`); continue; }
  if (/^\|/.test(line) && /^\|[\s|:-]+\|$/.test(lines[i + 1] || "")) {
    const head = cells(line);
    const rows = [];
    for (i += 2; i < lines.length && /^\|/.test(lines[i]); i++) rows.push(cells(lines[i]));
    i--;
    const isFeature = head[3] === "Where";
    const out = [`<div class="scroll"><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>`];
    for (const r of rows) {
      if (isFeature) {
        const cls = whereClass(r[3]);
        if (cls) counts[cls]++;
        out.push(`<tr data-where="${cls}"><td>${inline(r[0])}</td><td class="c">${mark(r[1])}</td><td class="c">${mark(r[2])}</td><td><span class="pill ${cls}">${esc(r[3])}</span></td><td class="note">${inline(r[4] || "")}</td></tr>`);
      } else {
        out.push(`<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`);
      }
    }
    out.push("</tbody></table></div>");
    body.push(out.join(""));
    continue;
  }
  if (/^- /.test(line)) {
    const items = [];
    for (; i < lines.length && /^- /.test(lines[i]); i++) items.push(`<li>${inline(lines[i].slice(2))}</li>`);
    i--;
    body.push(`<ul>${items.join("")}</ul>`);
    continue;
  }
  if (line.trim()) { const p = `<p>${inline(line)}</p>`; if (!body.length) lead += p; else body.push(p); }
}

const total = counts.both + counts.desk + counts.phone;
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Desktop and Phone Features</title>
<style>
:root{--bg:#f6f6f9;--surface:#fff;--ink:#1c1c26;--muted:#5d5d70;--line:#e3e5ea;--accent:#8a5a00;--both:#1f7a4d;--bothbg:#e1f3ea;--desk:#2b5bb8;--deskbg:#e4ecfb;--phone:#7a3fb0;--phonebg:#f0e6fa;--code:#eef0f4}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#09090e;--surface:#111118;--ink:#f1f1f6;--muted:#a6a6ba;--line:#23232f;--accent:#e3aa26;--both:#5ed39a;--bothbg:#10281e;--desk:#8fb2f5;--deskbg:#14213d;--phone:#c79df0;--phonebg:#26163a;--code:#1a1a24}}
:root[data-theme=dark]{--bg:#09090e;--surface:#111118;--ink:#f1f1f6;--muted:#a6a6ba;--line:#23232f;--accent:#e3aa26;--both:#5ed39a;--bothbg:#10281e;--desk:#8fb2f5;--deskbg:#14213d;--phone:#c79df0;--phonebg:#26163a;--code:#1a1a24}
:root[data-theme=light]{--bg:#f6f6f9;--surface:#fff;--ink:#1c1c26;--muted:#5d5d70;--line:#e3e5ea}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1040px;margin:0 auto;padding:28px 16px 64px}
h1{font:600 28px/1.2 Georgia,"Times New Roman",serif;margin:0 0 8px;text-wrap:balance}
h2{font-size:12px;letter-spacing:.09em;text-transform:uppercase;color:var(--accent);margin:34px 0 10px}
p{max-width:70ch;color:var(--muted);margin:8px 0}
code{background:var(--code);padding:1px 5px;border-radius:4px;font-size:.88em}
.bar{position:sticky;top:0;z-index:2;background:var(--bg);padding:12px 0;display:flex;flex-wrap:wrap;gap:8px;align-items:center;border-bottom:1px solid var(--line)}
.chip{border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:999px;padding:6px 14px;font:inherit;font-size:13px;cursor:pointer}
.chip[aria-pressed=true]{border-color:var(--accent);color:var(--accent);font-weight:600}
.chip:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
input[type=search]{flex:1;min-width:180px;border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:8px;padding:7px 12px;font:inherit;font-size:14px}
.scroll{overflow-x:auto;background:var(--surface);border:1px solid var(--line);border-radius:8px}
table{border-collapse:collapse;width:100%;min-width:640px}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:600}
tr:last-child td{border-bottom:0}
td.c,th:nth-child(2),th:nth-child(3){text-align:center;width:70px}
.note{color:var(--muted);font-size:13px}
.yes{color:var(--both);font-weight:700}.part{color:var(--accent);font-weight:700}.no{color:var(--muted)}
.pill{display:inline-block;border-radius:999px;padding:2px 10px;font-size:12px;white-space:nowrap}
.pill.both{background:var(--bothbg);color:var(--both)}.pill.desk{background:var(--deskbg);color:var(--desk)}.pill.phone{background:var(--phonebg);color:var(--phone)}
ul{padding-left:20px;color:var(--muted)}
.count{color:var(--muted);font-size:13px;margin-left:auto}
tr[hidden]{display:none}
@media (max-width:640px){main{padding:18px 12px 48px}h1{font-size:23px}}
</style></head><body><main>
<h1>${esc(title)}</h1>
${lead}
<div class="bar" role="group" aria-label="Filter features">
  <button class="chip" data-f="" aria-pressed="true">All (${total})</button>
  <button class="chip" data-f="both" aria-pressed="false">Both (${counts.both})</button>
  <button class="chip" data-f="desk" aria-pressed="false">Desktop only (${counts.desk})</button>
  <button class="chip" data-f="phone" aria-pressed="false">Phone only (${counts.phone})</button>
  <input type="search" id="q" placeholder="Search features" aria-label="Search features">
</div>
${body.join("\n")}
<script>
(function(){
  var f="",q="";
  function apply(){
    document.querySelectorAll("tr[data-where]").forEach(function(r){
      var ok=(!f||r.dataset.where===f)&&(!q||r.textContent.toLowerCase().indexOf(q)>-1);
      r.hidden=!ok;
    });
  }
  document.querySelectorAll(".chip").forEach(function(b){b.addEventListener("click",function(){
    f=b.dataset.f;document.querySelectorAll(".chip").forEach(function(x){x.setAttribute("aria-pressed",x===b?"true":"false")});apply();
  })});
  document.getElementById("q").addEventListener("input",function(e){q=e.target.value.toLowerCase().trim();apply()});
})();
</script></main></body></html>
`;
fs.writeFileSync(outPath, html);
console.log(`Wrote ${outPath} — ${total} features (${counts.both} both, ${counts.desk} desktop only, ${counts.phone} phone only)`);
