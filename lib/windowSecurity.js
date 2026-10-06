// Shared Electron window-hardening helper. Split out of main.js since it's
// used both by the main app window and by services/bgg.js's hidden scraping
// window — not specific to either.
//
// Out of scope for @media-vault/core (shared-core extraction, V3 plan) —
// permanently, not just for now: this hardens an Electron BrowserWindow,
// which has no React Native/mobile equivalent at all. Stays desktop-only.

// Blocks unexpected navigation and new-window/popup requests on a
// BrowserWindow — nothing in this app relies on either (every outbound link
// goes through shell:openExternal, never real in-page navigation or
// window.open), so this is pure hardening per Electron's security
// checklist. `allowedHosts`, if given, permits same-window navigation
// within those hostnames — used only by the BGG scraping window, which
// legitimately navigates within boardgamegeek.com; every other window gets
// zero allowed hosts, blocking all post-load navigation outright.
function restrictNavigation(win, allowedHosts = []) {
  win.webContents.on("will-navigate", (event, url) => {
    try {
      const { hostname } = new URL(url);
      if (allowedHosts.includes(hostname)) return;
    } catch { /* fall through to block */ }
    event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}

module.exports = { restrictNavigation };
