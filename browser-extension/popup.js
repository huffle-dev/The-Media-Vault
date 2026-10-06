// Opens vault://search?type=<mediaType>&q=<query> — the OS hands this off
// to The Media Vault desktop app (main.js's handleDeepLink), which opens Search
// Online pre-filled and already searching.
//
// Two things that DON'T work here, both tried and confirmed broken live:
// chrome.tabs.create({ url }) just navigates a new tab to a blank page —
// Chrome doesn't run its external-protocol handoff for a tab opened that
// way. Neither does clicking a real <a href> from inside the popup's own
// tiny page — Chrome's popup surface doesn't get the same top-level-
// navigation treatment a real tab does, so nothing happens at all.
// chrome.tabs.update() on the user's actual current tab is the one that
// works: it's a genuine top-level navigation of a real tab, which Chrome
// does intercept and hand off to the OS — the current page's content stays
// intact once the "Open The Media Vault?" prompt is dismissed.

const typeEl = document.getElementById("mediaType");
const queryEl = document.getElementById("query");
const yearEl = document.getElementById("year");

// Year only applies to Movie/TV searches — hide the field for everything else.
function syncYearRow() {
  document.getElementById("yearRow").hidden = !["Movie", "TV"].includes(typeEl.value);
}

function openInVault() {
  const type = typeEl.value;
  const q = queryEl.value.trim();
  if (!q) return;
  let url = `vault://search?type=${encodeURIComponent(type)}&q=${encodeURIComponent(q)}`;
  const year = yearEl.value.trim();
  if (["Movie", "TV"].includes(type) && /^\d{4}$/.test(year)) url += `&year=${year}`;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) chrome.tabs.update(tabs[0].id, { url });
    window.close();
  });
}

// On an IMDb/Steam/GOG page, pre-fill the fields (see detect.js). Pre-fill
// only — nothing is sent until the button is pressed.
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const found = tabs[0] && detectFromTab(tabs[0]);
  if (found) {
    typeEl.value = found.type;
    queryEl.value = found.query;
    yearEl.value = found.year || "";
    const hint = document.getElementById("hint");
    hint.textContent = `Filled in from this ${found.source} page`;
    hint.hidden = false;
    queryEl.select();
  }
  syncYearRow();
});

typeEl.addEventListener("change", syncYearRow);
document.getElementById("openBtn").addEventListener("click", openInVault);
[queryEl, yearEl].forEach((el) => el.addEventListener("keydown", (e) => {
  if (e.key === "Enter") openInVault();
}));
