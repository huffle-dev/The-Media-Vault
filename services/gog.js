// GOG integration. No "paste a public API key" option — real OAuth login.
// GOG_CLIENT_ID/SECRET are the long-standing values GOG's own Galaxy client
// (and community tools) use, since GOG offers no per-app registration —
// fixed app constants, not a per-user setting.

const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);
const { fetchWithTimeout: fetch } = require("@media-vault/core/fetchWithTimeout");
const { downloadImage } = require("../lib/downloadImage");
const { coverArtDir } = require("../lib/appPaths");
const { BROWSER_HEADERS } = require("@media-vault/core/httpHeaders");
const { stripHtml } = require("@media-vault/core/htmlText");
const { GOG_AUTH_URL, exchangeGogCode, fetchGogUsername, fetchGogLibrary } = require("@media-vault/core/gogLibrary");

// A title, stripped down to bare alphanumerics — good enough to compare
// "Fallout 2 Classic" against "Fallout 2" without caring about spacing,
// case, or a trailing "Classic"/"Edition"/etc.
const normalizeTitle = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Shared by coverArt:fetch and gog:enrich — GOG has no direct by-id lookup
// with genre/developer/cover fields, so both search catalog.gog.com by
// title and match back to the stored id. Strips a colon (breaks the search
// outright, verified live) and trademark symbols. Throws on fetch failure
// so callers can distinguish "retry later" from "no match".
//
// limit=20, not 5 — some library items carry old, pre-migration GOG ids
// whose title doesn't rank reliably in current search results (verified
// live: a bare "Fallout" query ranks the correct match 4th).
async function resolveGogCatalogMatch(title, numericId) {
  const cleanTitle = title.replace(/[™®©:]/g, "").replace(/\s+/g, " ").trim();
  const res = await fetch(`https://catalog.gog.com/v1/catalog?query=${encodeURIComponent(cleanTitle)}&limit=20`, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`GOG catalog search failed (${res.status}).`);
  const data = await res.json();
  const products = data.products || [];
  const exact = products.find(p => String(p.id) === numericId);
  if (exact) return exact;
  // Falls back to a title match across the 20-wide result list.
  const a = normalizeTitle(title);
  if (a) {
    const found = products.find(p => {
      const b = normalizeTitle(p.title);
      return b && (a.includes(b) || b.includes(a));
    });
    if (found) return found;
  }
  return null;
}

// Last-resort cover for a GOG item the catalog search can't find at all
// (some products, verified live, aren't in the searchable catalog). No
// genre/developer here, but the background image beats no cover at all —
// and it's guaranteed the right game since it's a direct id lookup.
async function fetchGogDirectImage(numericId) {
  const res = await fetch(`https://api.gog.com/products/${numericId}`, { headers: BROWSER_HEADERS });
  if (!res.ok) return null;
  const data = await res.json();
  const raw = data?.images?.background || data?.images?.logo2x || data?.images?.logo;
  if (!raw) return null;
  return raw.startsWith("//") ? `https:${raw}` : raw;
}

// coverArt:fetch (Game, GOG portion) — "gog-" isn't a Steam appid, so
// resolves and downloads directly rather than a blind Steam search.
async function fetchGogCoverArt(platformId, title, destPath) {
  const numericId = platformId.replace(/^gog-/, "");
  const match = await resolveGogCatalogMatch(title, numericId);
  let coverUrl = match?.coverVertical || match?.coverHorizontal || match?.cover;
  if (!coverUrl) coverUrl = await fetchGogDirectImage(numericId);
  if (!coverUrl) throw new Error("No cover found on GOG — try uploading art manually.");
  await downloadImage(coverUrl, destPath, BROWSER_HEADERS);
  return destPath;
}

// search:query (Game, GOG portion).
async function searchGogGames(query) {
  // Public/keyless, but behind Cloudflare bot-management, hence BROWSER_HEADERS.
  const url = `https://catalog.gog.com/v1/catalog?query=${encodeURIComponent(query)}&limit=24`;
  const res = await fetch(url, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error("GOG search failed.");
  const data = await res.json();
  return (data.products || []).slice(0, 24).map(p => ({
    platformId:  String(p.id),
    title:       p.title,
    type:        "game",
    storeUrl:    p.slug ? `https://www.gog.com/game/${p.slug}` : null,
    storeLabel:  "GOG ↗",
    thumbnailUrl: p.coverVertical || p.coverHorizontal || null,
    source:      "gog",
    // Threaded to getGogGameDetails — already have these, no need to re-fetch.
    year:    p.releaseDate ? parseInt(p.releaseDate.slice(0, 4), 10) : null,
    creator: p.developers?.[0] || null,
    genre:   p.genres?.[0]?.name || null,
  }));
}

// resolveSearchDetails (Game, GOG portion) — image/genre already came from
// searchGogGames; this call is purely for the full description text.
async function getGogGameDetails(platformId, thumbnailUrl, year, genre, creator) {
  const res = await fetch(`https://api.gog.com/products/${platformId}?expand=description`, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error("Failed to fetch GOG game details.");
  const game = await res.json();

  let cover_art_path = null;
  if (thumbnailUrl) {
    try {
      const destPath = path.join(coverArtDir(), `gog-${platformId}.jpg`);
      if (!fs.existsSync(destPath)) await downloadImage(thumbnailUrl, destPath, BROWSER_HEADERS);
      cover_art_path = destPath;
    } catch { /* falls back to no art */ }
  }

  return {
    title:       game.title,
    media_type:  "Game",
    platform_id: `gog-${platformId}`,
    year:        year ?? null,
    genre:       genre || null,
    creator:     creator || null,
    notes:       game.description?.lead ? stripHtml(game.description.lead) : null,
    cover_art_path,
  };
}

// gog:enrich's per-item portion — api.gog.com/products has no genre/
// developer/cover fields, so this searches catalog.gog.com by title instead
// and matches back to the stored id. Throws on fetch failure so main.js's
// loop can distinguish "retry later" from "no match".
async function fetchGogGameDetails(numericId, title) {
  const match = await resolveGogCatalogMatch(title, numericId);
  // No search match — not every GOG product is in the searchable catalog.
  // Falls back to a direct id lookup's non-box-art image, which beats nothing.
  let coverUrl = match ? (match.coverVertical || match.coverHorizontal || match.cover) : null;
  if (!coverUrl) coverUrl = await fetchGogDirectImage(numericId);
  let cover_art_path = null;
  if (coverUrl) {
    try {
      const destPath = path.join(coverArtDir(), `gog-enrich-${numericId}.jpg`);
      if (!fs.existsSync(destPath)) await downloadImage(coverUrl, destPath, BROWSER_HEADERS);
      cover_art_path = destPath;
    } catch { /* falls back to no art */ }
  }
  return {
    genre:   match?.genres?.[0]?.name || null,
    creator: match?.developers?.[0]    || null,
    cover_art_path,
  };
}

// gog:scanInstalled — resolves a GOG game's installed executable path, for
// the Launch button. Unlike Steam, GOG has no launch-by-id protocol; Galaxy
// writes install info into the Windows registry keyed by game id.
// Windows-only — resolveGogInstall is a no-op elsewhere.

// 64-bit Windows redirects HKLM\SOFTWARE\GOG.com through Wow6432Node — tried
// first since that's the common case, falling back to the un-redirected path
// for a genuine 32-bit install.
const GOG_REGISTRY_ROOTS = [
  "HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games",
  "HKLM\\SOFTWARE\\GOG.com\\Games",
];

// Parsed into a {name: value} map rather than targeting one specific name —
// GOG's exact value names here aren't fully documented, so resolveGogInstall
// tries a few plausible candidates instead of assuming one is right.
async function queryGogRegistryValues(gameId) {
  for (const root of GOG_REGISTRY_ROOTS) {
    try {
      const { stdout } = await execFileAsync("reg", ["query", `${root}\\${gameId}`]);
      const values = {};
      for (const line of stdout.split(/\r?\n/)) {
        const m = line.match(/^\s{4}(\S+)\s+(REG_\S+)\s+(.*)$/);
        if (m) values[m[1].toLowerCase()] = m[3].trim();
      }
      if (Object.keys(values).length) return values;
    } catch {
      // Key not found under this root (ENOENT-equivalent for `reg query`,
      // non-zero exit) — try the next root, or fall through to null below.
    }
  }
  return null;
}

// Galaxy drops a goggame-<id>.info manifest in the install folder — its
// primary playTasks entry's `path` is the actual executable. Fallback when
// the registry doesn't hand us a direct executable path.
function readGogPrimaryExeFromManifest(installDir, gameId) {
  let raw;
  try {
    raw = fs.readFileSync(path.join(installDir, `goggame-${gameId}.info`), "utf8");
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const tasks = Array.isArray(parsed.playTasks) ? parsed.playTasks : [];
  const primary = tasks.find(t => t.isPrimary) || tasks.find(t => t.category === "game");
  if (!primary || !primary.path) return null;
  return path.join(installDir, primary.path);
}

// Resolves one GOG game id to its installed executable path, or null if not
// installed or the manifest is missing/unreadable (same "not installed").
async function resolveGogInstall(gameId) {
  if (process.platform !== "win32") return null;
  const values = await queryGogRegistryValues(gameId);
  if (!values) return null;
  // Try a direct executable path first, else fall back to the manifest lookup.
  const directExe = values.exe || values.exepath || values.executable;
  if (directExe && fs.existsSync(directExe)) return directExe;
  const installDir = values.path || values.installpath || values.installlocation;
  if (!installDir) return null;
  const exe = readGogPrimaryExeFromManifest(installDir, gameId);
  return exe && fs.existsSync(exe) ? exe : null;
}

module.exports = {
  GOG_AUTH_URL,
  fetchGogCoverArt,
  searchGogGames,
  getGogGameDetails,
  fetchGogGameDetails,
  exchangeGogCode,
  fetchGogUsername,
  fetchGogLibrary,
  resolveGogInstall,
};
