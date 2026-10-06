// BoardGameGeek (BGG) integration. Unlike most services here, BGG needs a
// real Electron BrowserWindow (not just fetch) to get past Cloudflare, so
// this module depends on electron directly.

const { BrowserWindow } = require("electron");
const { restrictNavigation } = require("../lib/windowSecurity");

// BGG's XML API is dead; the site's own endpoints work but are Cloudflare-
// protected. A hidden window that has loaded boardgamegeek.com holds the
// cf_clearance cookie, so fetches from inside it pass like a real browser.

let bggWin = null;
let bggReady = null;

function ensureBggWindow() {
  if (bggReady) return bggReady;
  bggWin = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, offscreen: false, sandbox: true },
  });
  // Restricted strictly to boardgamegeek.com, not wherever a redirect
  // or injected script might otherwise try to send it.
  restrictNavigation(bggWin, ["boardgamegeek.com", "www.boardgamegeek.com"]);
  bggWin.on("closed", () => { bggWin = null; bggReady = null; });
  bggReady = new Promise((resolve, reject) => {
    bggWin.webContents.once("did-finish-load", () => {
      // Give Cloudflare a beat to set cf_clearance before first use.
      setTimeout(() => resolve(bggWin), 1200);
    });
    bggWin.webContents.once("did-fail-load", (_e, code, desc) => {
      bggReady = null;
      reject(new Error(`Couldn't reach BoardGameGeek (${desc || code}).`));
    });
  });
  bggWin.loadURL("https://boardgamegeek.com/");
  return bggReady;
}

// Run a fetch inside the BGG window context and return text or parsed JSON.
// Retries once (rebuilding the window) if Cloudflare rejects a stale session.
async function bggFetch(url, kind) {
  const run = async () => {
    const win = await ensureBggWindow();
    // Runs inside the hidden BGG window's own renderer, not Node — a bare
    // fetch() there has no timeout either, so a stalled request would hang
    // this whole call (and executeJavaScript's own promise) forever, same
    // as the Node-side fetchWithTimeout calls elsewhere fix. Chromium's
    // renderer supports AbortSignal.timeout the same way Node's fetch does.
    const expr = `fetch(${JSON.stringify(url)}, { signal: AbortSignal.timeout(15000) }).then(async r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.${kind === "json" ? "json()" : "text()"};
    })`;
    return win.webContents.executeJavaScript(expr, true);
  };
  try {
    return await run();
  } catch (err) {
    if (/HTTP 40[13]/.test(String(err && err.message))) {
      if (bggWin && !bggWin.isDestroyed()) bggWin.destroy();
      bggWin = null; bggReady = null;
      return run();
    }
    throw err;
  }
}

function searchBggText(query) {
  return bggFetch(`https://boardgamegeek.com/geeksearch.php?action=search&objecttype=boardgame&q=${encodeURIComponent(query)}&B1=Go`, "text");
}

// objectType defaults to "thing" (a game), also accepts "boardgamedesigner".
function fetchBggItemRaw(objectId, objectType = "thing") {
  return bggFetch(`https://api.geekdo.com/api/geekitems?objecttype=${objectType}&objectid=${encodeURIComponent(objectId)}&nosession=1`, "json");
}

function getBggStats(bggId) {
  return bggFetch(`https://api.geekdo.com/api/dynamicinfo?objecttype=thing&objectid=${encodeURIComponent(bggId)}&nosession=1`, "json");
}

// "Expansions" for Board Game — genuinely real BGG data. Combines
// `links.boardgameexpansion` and `links.expandsboardgame` so this works
// symmetrically regardless of which side of the relationship the item is on.
async function getBggExpansions(bggId) {
  if (!bggId) return [];
  try {
    const data = await fetchBggItemRaw(bggId);
    const links = data?.item?.links || {};
    const related = [...(links.boardgameexpansion || []), ...(links.expandsboardgame || [])].slice(0, 12);
    // Relationship links carry only id/name — one extra fetch per item for
    // real cover art. Falls back to the bare name rather than dropping it.
    return await Promise.all(related.map(async r => {
      try {
        const d = await fetchBggItemRaw(r.objectid);
        return {
          id: r.objectid, mediaType: "Board Game", source: "bgg",
          title: d?.item?.name || r.name,
          year: d?.item?.yearpublished ? parseInt(d.item.yearpublished, 10) : null,
          coverUrl: d?.item?.imageurl || null,
        };
      } catch {
        return { id: r.objectid, mediaType: "Board Game", source: "bgg", title: r.name, year: null, coverUrl: null };
      }
    }));
  } catch {
    return [];
  }
}

// Resolves a designer name to their BGG person id — no id is stored, so
// a name search each time, cached in memory (same shape as IGDB's cache).
const bggDesignerIdCache = new Map(); // lowercased name -> id | null

async function resolveBggDesignerId(name) {
  const key = name.trim().toLowerCase();
  if (bggDesignerIdCache.has(key)) return bggDesignerIdCache.get(key);
  let id = null;
  try {
    const html = await bggFetch(`https://boardgamegeek.com/geeksearch.php?action=search&objecttype=boardgamedesigner&q=${encodeURIComponent(name)}&B1=Go`, "text");
    const match = html.match(/boardgamedesigner\/(\d+)\//);
    if (match) id = match[1];
  } catch { /* leaves id null — cached as a genuine miss */ }
  bggDesignerIdCache.set(key, id);
  return id;
}

// "More from Designer" — a real public BGG endpoint returns a designer's
// full credit list; `primarylink` filters out secondary/promotional entries.
async function getBggMoreFromDesigner(designer, excludeTitle) {
  if (!designer) return [];
  try {
    const designerId = await resolveBggDesignerId(designer);
    if (!designerId) return [];
    const data = await fetchBggItemRaw(designerId, "boardgamedesigner");
    const credits = data?.item?.links?.boardgamedesigner || [];
    const exclude = (excludeTitle || "").trim().toLowerCase();
    const mainCredits = credits
      .filter(c => c.primarylink === 1 && c.name && c.name.trim().toLowerCase() !== exclude)
      .slice(0, 12);
    return await Promise.all(mainCredits.map(async c => {
      try {
        const d = await fetchBggItemRaw(c.objectid);
        return {
          id: c.objectid, mediaType: "Board Game", source: "bgg",
          title: d?.item?.name || c.name,
          year: d?.item?.yearpublished ? parseInt(d.item.yearpublished, 10) : null,
          coverUrl: d?.item?.imageurl || null,
        };
      } catch {
        return { id: c.objectid, mediaType: "Board Game", source: "bgg", title: c.name, year: null, coverUrl: null };
      }
    }));
  } catch {
    return [];
  }
}

module.exports = {
  searchBggText,
  fetchBggItemRaw,
  getBggStats,
  getBggExpansions,
  getBggMoreFromDesigner,
};
