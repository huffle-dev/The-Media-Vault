// Opens vault://search?type=<mediaType>&q=<query> — the OS hands this off
// to The Media Vault desktop app (main.js's handleDeepLink), which opens Search
// Online pre-filled and already searching.
//
// Same handoff quirk as the Chrome build (see browser-extension/popup.js):
// creating a new tab or clicking a real <a href> from inside the popup
// doesn't trigger the browser's external-protocol handoff — only a genuine
// top-level navigation of the user's actual current tab does. Firefox's
// browser.tabs API is promise-based (no callback param), unlike Chrome's,
// so this uses that native shape rather than the chrome.* compatibility
// alias Firefox also provides.

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
  browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    if (tabs[0]) browser.tabs.update(tabs[0].id, { url });
    window.close();
  });
}

// On an IMDb/Steam/GOG page, pre-fill the fields (see detect.js). Pre-fill
// only — nothing is sent until the button is pressed.
browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
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
