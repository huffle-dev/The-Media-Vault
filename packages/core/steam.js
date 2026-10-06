// Steam integration. Split out of main.js as part of the code-organization
// plan, Games/Steam pass. Factory (createSteamService(storage)) — see
// packages/core/movie.js's header comment for why.

const { BROWSER_HEADERS } = require("@media-vault/core/httpHeaders");
const { fetchWithTimeout: fetch } = require("@media-vault/core/fetchWithTimeout");

module.exports = function createSteamService(storage) {

// steam:fetch — owned games + wishlist (resolved appId → title in chunks of
// 20 to avoid rate limiting), both via the Steam Web API using the same key.
async function fetchSteamLibrary(steamId, apiKey) {
  // Owned games
  const ownedUrl = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${steamId}&include_appinfo=true&format=json`;
  const ownedRes = await fetch(ownedUrl);

  if (ownedRes.status === 401 || ownedRes.status === 403) {
    throw new Error("Steam rejected the API key — check you copied it correctly from steamcommunity.com/dev/apikey.");
  }
  if (!ownedRes.ok) throw new Error(`Steam API error: ${ownedRes.status}`);

  let ownedData;
  try {
    ownedData = await ownedRes.json();
  } catch {
    throw new Error("Steam returned an unexpected response — your API key may be invalid, or your Steam profile / game details must be set to Public.");
  }

  if (!ownedData.response || !ownedData.response.games) {
    throw new Error("No games found — make sure your Steam profile and Game details are set to Public in Steam Privacy Settings.");
  }

  // Wishlist — uses Steam Web API (same key as owned games)
  const wishlistUrl = `https://api.steampowered.com/IWishlistService/GetWishlist/v1/?key=${apiKey}&steamid=${steamId}`;
  const wishlistRes = await fetch(wishlistUrl);
  let wishlist = [];
  let wishlistError = null;

  if (wishlistRes.ok) {
    try {
      const raw = await wishlistRes.json();
      const items = raw?.response?.items || [];
      if (items.length === 0) {
        wishlistError = "Wishlist is empty or not public. In Steam: Edit Profile → Privacy Settings → Game Details → Public.";
      } else {
        // Resolve appIds to titles — parallel requests, 20 at a time to avoid rate limiting
        const appIds = items.map(i => i.appid);
        const concurrency = 20;
        for (let i = 0; i < appIds.length; i += concurrency) {
          const chunk = appIds.slice(i, i + concurrency);
          const results = await Promise.all(chunk.map(async (appId) => {
            try {
              const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appId}&filters=basic&cc=us&l=english`);
              if (!res.ok) return null;
              const data = await res.json();
              const name = data[String(appId)]?.data?.name;
              return name ? { appId, title: name } : null;
            } catch { return null; }
          }));
          results.forEach(r => { if (r) wishlist.push(r); });
        }
      }
    } catch {
      wishlistError = "Could not parse wishlist data from Steam API.";
    }
  } else {
    wishlistError = `Wishlist fetch failed (${wishlistRes.status}). Check your Steam API key is valid.`;
  }

  const owned = ownedData.response.games.map(g => ({
    appId:    g.appid,
    title:    g.name,
    playtime: g.playtime_forever || 0,
    owned:    true,
    wishlist: false,
  }));

  return { owned, wishlist, wishlistError };
}

// coverArt:fetch (Game, Steam portion) — uses the stored appId, or falls
// back to a title search. Returns null if Steam has nothing (caller tries
// IGDB next). Only accepts an exact title match (storesearch is loose text
// matching) and never re-downloads over an existing file.
async function fetchSteamGameCoverArt(platformId, title, destPath) {
  if (storage.fileExists(destPath)) return destPath;

  let appId = platformId ? parseInt(platformId, 10) : null;

  if (!appId) {
    const searchUrl  = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(title)}&l=english&cc=us`;
    const searchRes  = await fetch(searchUrl);
    if (!searchRes.ok) throw new Error("Steam store search failed.");
    const searchData = await searchRes.json();
    const normalize = (s) => (s || "").trim().toLowerCase();
    const exact = (searchData.items || []).find(it => normalize(it.name) === normalize(title));
    if (!exact) return null;
    appId = exact.id;
  }

  // Try portrait first, fall back to header (exists for all Steam games)
  const urls = [
    `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`,
    `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`,
  ];
  for (const artUrl of urls) {
    try {
      await storage.downloadImage(artUrl, destPath);
      return destPath;
    } catch {}
  }
  return null;
}

// Cover art for a Steam appid straight from Steam's CDN — portrait first,
// header as the fallback (exists for every game) — without the appdetails
// call fetchSteamGameDetails makes (Steam rate-limits that one to roughly
// 200 requests per 5 minutes). Same file name as fetchSteamGameDetails uses,
// so the two share one cached image. Resolves to the local path, or null.
async function ensureSteamCover(platformId) {
  for (const url of [
    `https://cdn.akamai.steamstatic.com/steam/apps/${platformId}/library_600x900.jpg`,
    `https://cdn.akamai.steamstatic.com/steam/apps/${platformId}/header.jpg`,
  ]) {
    try {
      const destPath = storage.joinPath(storage.coverArtDir(), `steam-enrich-${platformId}.jpg`);
      await storage.ensureImage(url, destPath);
      return destPath;
    } catch { /* try the next one */ }
  }
  return null;
}

// search:query (Game, Steam portion).
async function searchSteamGames(query) {
  const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&l=english&cc=us`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Steam search failed.");
  const data = await res.json();
  const inferType = (name) => {
    const n = name.toLowerCase();
    if (/soundtrack|ost\b|original score/.test(n)) return "music";
    if (/\bdlc\b|season pass|expansion|pack\b|bundle/.test(n)) return "dlc";
    if (/\bdemo\b/.test(n)) return "demo";
    if (/\btrailer\b|\bteaser\b/.test(n)) return "trailer";
    return "game";
  };
  return (data.items || []).slice(0, 24).map(g => ({
    platformId:  String(g.id),
    title:       g.name,
    type:        inferType(g.name),
    storeUrl:    `https://store.steampowered.com/app/${g.id}/`,
    storeLabel:  "Steam ↗",
  }));
}

// "More Like This" — Steam has no JSON similar-games API, but its own store
// recommendations page does the job; pulls appids from `data-ds-appid`
// attributes (no HTML parser dependency), then an appdetails call per id.
async function fetchSteamSimilarGames(appid) {
  const res = await fetch(`https://store.steampowered.com/recommended/morelike/app/${appid}`, { headers: BROWSER_HEADERS });
  if (!res.ok) return [];
  const html = await res.text();
  const ids = [...new Set(Array.from(html.matchAll(/data-ds-appid="(\d+)"/g), m => m[1]))]
    .filter(id => id !== String(appid))
    .slice(0, 12);

  const results = await Promise.all(ids.map(async (id) => {
    try {
      const r = await fetch(`https://store.steampowered.com/api/appdetails?appids=${id}&cc=us&l=english`);
      if (!r.ok) return null;
      const data = await r.json();
      const entry = data[id];
      if (!entry?.success || !entry.data) return null;
      const g = entry.data;
      // Same portrait-with-fallback convention search:thumbnail uses —
      // appdetails only offers landscape images, inconsistent next to
      // owned games' portrait art.
      const portraitUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${id}/library_600x900.jpg`;
      let coverUrl = g.header_image || null;
      try {
        const portraitRes = await fetch(portraitUrl, { method: "HEAD" });
        if (portraitRes.ok) coverUrl = portraitUrl;
      } catch { /* keep the landscape fallback */ }
      return {
        id: Number(id),
        mediaType: "Game",
        title: g.name,
        year: g.release_date?.date ? new Date(g.release_date.date).getFullYear() || null : null,
        coverUrl,
        genre: g.genres?.[0]?.description || null,
      };
    } catch {
      return null;
    }
  }));
  return results.filter(Boolean);
}

// steam:enrich (per-item portion) — returns null on request failure (caller
// leaves metadata_fetched unset to retry), otherwise an object, possibly
// all-null if Steam has no data for this id (still counts as "attempted").
async function fetchSteamGameDetails(platformId) {
  const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${platformId}&cc=us&l=english`);
  if (!res.ok) return null;

  const data = await res.json();
  const entry = data[String(platformId)];
  if (!entry?.success || !entry.data) return {};

  const game = entry.data;
  const releaseYear = game.release_date?.date
    ? new Date(game.release_date.date).getFullYear() || null
    : null;

  // Same portrait-then-header fallback chain as fetchSteamGameCoverArt.
  let cover_art_path = null;
  for (const url of [
    `https://cdn.akamai.steamstatic.com/steam/apps/${platformId}/library_600x900.jpg`,
    `https://cdn.akamai.steamstatic.com/steam/apps/${platformId}/header.jpg`,
  ]) {
    try {
      const destPath = storage.joinPath(storage.coverArtDir(), `steam-enrich-${platformId}.jpg`);
      await storage.ensureImage(url, destPath);
      cover_art_path = destPath;
      break;
    } catch { /* try next */ }
  }

  return {
    genre:   game.genres?.[0]?.description || null,
    creator: game.developers?.[0]           || null,
    year:    releaseYear,
    notes:   game.short_description         || null,
    cover_art_path,
  };
}

// search:details' Steam branch — full details for a not-yet-owned result,
// distinct from fetchSteamGameDetails (patches an owned item, downloads its
// own cover art). This one leaves cover art to coverArt:fetch.
async function getSteamGameDetailsById(platformId, inferredType) {
  const typeToMediaType = { music: "Music", dlc: "Game", demo: "Game", game: "Game" };

  const url = `https://store.steampowered.com/api/appdetails?appids=${platformId}&cc=us&l=english`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch game details.");
  const data = await res.json();
  const game = data[platformId]?.data;
  if (!game) throw new Error("Game not found.");

  const dateStr = game.release_date?.date || "";
  const yearMatch = dateStr.match(/\d{4}/);
  const year = yearMatch ? parseInt(yearMatch[0], 10) : null;

  const resolvedMediaType = typeToMediaType[inferredType] || "Game";
  return {
    title:       game.name,
    media_type:  resolvedMediaType,
    platform_id: platformId,
    steam_url:   `https://store.steampowered.com/app/${platformId}/`,
    year,
    genre:   game.genres?.[0]?.description   || null,
    creator: game.developers?.[0]             || null,
    notes:   game.short_description           || null,
    metacritic_rating: game.metacritic?.score ?? null, // not every game has one
  };
}

return {
  fetchSteamLibrary,
  getSteamGameDetailsById,
  fetchSteamGameCoverArt,
  searchSteamGames,
  fetchSteamSimilarGames,
  fetchSteamGameDetails,
  ensureSteamCover,
};

}; // end createSteamService
