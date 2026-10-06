// IGDB (optional Game metadata/cover-art source) integration. Not locked to
// one storefront, unlike Steam — covers console-only/any-publisher titles.
// Requires the user's own free Twitch app (Client ID + Secret), a Client
// Credentials OAuth exchange. Functions take clientId/clientSecret as
// parameters — main.js owns settings access, keeping this module database-free.
//
// Factory (createIgdbService(storage)) — see packages/core/movie.js's header
// comment for why. The token cache, request throttle chain, and id caches
// below are per-instance (one per app run on each platform), same lifetime
// as when they were module-level.

const { fetchWithTimeout: fetch } = require("@media-vault/core/fetchWithTimeout");

module.exports = function createIgdbService(storage) {

// Long-lived (~60 days) — cached in memory per app run, re-minted on relaunch.
let igdbTokenCache = null; // { token, expiresAt } | null

async function getIgdbToken(clientId, clientSecret) {
  if (!clientId || !clientSecret) return null;

  if (igdbTokenCache && igdbTokenCache.expiresAt > Date.now()) {
    return { token: igdbTokenCache.token, clientId };
  }

  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error("IGDB authentication failed — check the Client ID/Secret in Settings.");
  const data = await res.json();
  if (!data.access_token) throw new Error("IGDB authentication failed — no token returned.");

  // Refresh 5 minutes early rather than cutting it exactly at expiry.
  igdbTokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 300) * 1000 };
  return { token: igdbTokenCache.token, clientId };
}

// IGDB's query language (not REST params) — a single POST body string.
//
// Throttled below IGDB's documented 4 req/sec limit — a 429 would otherwise
// degrade silently to blank rows (hard to diagnose), and one Game profile
// can fire up to 3 of these at once.
const IGDB_MIN_REQUEST_GAP_MS = 300; // ~3.3 req/sec
let igdbRequestChain = Promise.resolve();
let igdbLastRequestAt = 0;

async function igdbQuery(endpoint, body, clientId, clientSecret) {
  const auth = await getIgdbToken(clientId, clientSecret);
  if (!auth) return null;

  // Each call queues behind the previous one to space out bursts.
  const myTurn = igdbRequestChain.then(async () => {
    const waitFor = IGDB_MIN_REQUEST_GAP_MS - (Date.now() - igdbLastRequestAt);
    if (waitFor > 0) await new Promise(r => setTimeout(r, waitFor));
    igdbLastRequestAt = Date.now();
  });
  igdbRequestChain = myTurn;
  await myTurn;

  const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: "POST",
    headers: {
      "Client-ID": auth.clientId,
      "Authorization": `Bearer ${auth.token}`,
      "Content-Type": "text/plain",
    },
    body,
  });
  if (!res.ok) throw new Error(`IGDB request failed (${res.status}).`);
  return await res.json();
}

const IGDB_FIELDS = "name,url,cover.image_id,genres.name,themes.name,game_modes.name,player_perspectives.name,game_engines.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,platforms.name,first_release_date,summary,total_rating,total_rating_count";

// Shapes one raw IGDB game object into this app's item fields — shared by
// the title-search path and the direct-id re-fetch path below.
async function igdbGameToItem(g) {
  const developer = g.involved_companies?.find(c => c.developer)?.company?.name || null;
  const publisher = g.involved_companies?.find(c => c.publisher)?.company?.name || null;

  let cover_art_path = null;
  if (g.cover?.image_id) {
    try {
      const destPath = storage.joinPath(storage.coverArtDir(), `igdb-${g.id}.jpg`);
      await storage.ensureImage(`https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg`, destPath);
      cover_art_path = destPath;
    } catch { /* falls back to no art, same as other sources */ }
  }

  return {
    title:               g.name,
    media_type:          "Game",
    // "igdb-" prefix, not bare — a bare numeric id reads as a Steam appid
    // to launchAction() (tokens.js), wrongly enabling a Steam launch button.
    platform_id:         `igdb-${g.id}`,
    igdb_url:            g.url || null,
    // Blended user+critic score (0-100), rounded to 1 decimal for display.
    igdb_rating:         g.total_rating != null ? Math.round(g.total_rating * 10) / 10 : null,
    igdb_rating_count:   g.total_rating_count ?? null,
    creator:             developer,
    publisher:           publisher,
    platform:            g.platforms?.length ? g.platforms.map(p => p.name).join(", ") : null,
    genre:               g.genres?.length ? g.genres.map(x => x.name).join(", ") : null,
    themes:              g.themes?.length ? g.themes.map(x => x.name).join(", ") : null,
    game_modes:          g.game_modes?.length ? g.game_modes.map(x => x.name).join(", ") : null,
    player_perspective:  g.player_perspectives?.length ? g.player_perspectives.map(x => x.name).join(", ") : null,
    game_engine:         g.game_engines?.length ? g.game_engines.map(x => x.name).join(", ") : null,
    year:                g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : null,
    notes:               g.summary || null,
    cover_art_path,
  };
}

// search:query (Game, IGDB portion) — explicit pick or SearchModal's
// fallback once Steam/GOG are empty.
async function searchIgdbGames(query, clientId, clientSecret) {
  if (!clientId || !clientSecret) {
    throw new Error("No IGDB key set — add one in Settings ⚙ → API Keys → Games.");
  }
  const results = await igdbQuery("games", `search "${query.replace(/"/g, '\\"')}"; fields ${IGDB_FIELDS}; limit 24;`, clientId, clientSecret);
  return (results || []).map(g => ({
    platformId:  String(g.id),
    title:       g.name,
    type:        "game",
    storeUrl:    g.url || null,
    storeLabel:  "IGDB ↗",
    thumbnailUrl: g.cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg` : null,
    source:      "igdb",
  }));
}

// Used by resolveSearchDetails for Search Online's add flow — the exact id
// is already known, same shaping as enrichGameItemViaIgdb's search path.
async function getIgdbGameDetailsById(platformId, clientId, clientSecret) {
  const results = await igdbQuery("games", `where id = ${parseInt(platformId, 10)}; fields ${IGDB_FIELDS};`, clientId, clientSecret);
  if (!results?.length) throw new Error("Game not found on IGDB.");
  return await igdbGameToItem(results[0]);
}

// coverArt:fetch (Game, IGDB fallback) — returns null (not throws) so the
// caller's combined "no cover found" error reads as one failure.
async function fetchIgdbCoverArt(title, destPath, clientId, clientSecret) {
  const results = await igdbQuery("games", `search "${title.replace(/"/g, '\\"')}"; fields cover.image_id; limit 1;`, clientId, clientSecret);
  if (results?.length && results[0].cover?.image_id) {
    await storage.downloadImage(`https://images.igdb.com/igdb/image/upload/t_cover_big/${results[0].cover.image_id}.jpg`, destPath);
    return destPath;
  }
  return null;
}

// Same title-search fallback as enrichMusicItem/enrichPodcastItem — lets
// Fetch Info work without needing Search Online.
async function enrichGameItemViaIgdb(item, clientId, clientSecret) {
  if (item.platform_id && String(item.platform_id).startsWith("igdb-")) {
    const igdbId = item.platform_id.slice("igdb-".length);
    const results = await igdbQuery("games", `where id = ${parseInt(igdbId, 10)}; fields ${IGDB_FIELDS};`, clientId, clientSecret);
    if (!results?.length) throw new Error("Game not found on IGDB.");
    return await igdbGameToItem(results[0]);
  }
  if (!item.title) throw new Error("No title to search with.");
  const query = `search "${item.title.replace(/"/g, '\\"')}"; fields ${IGDB_FIELDS}; limit 10;`;
  const results = await igdbQuery("games", query, clientId, clientSecret);
  if (!results?.length) throw new Error("No match found on IGDB.");
  // IGDB's search is a loose text match — for a reused title ("Prince of
  // Persia" spans several unrelated games/compilations) the top hit is
  // often wrong (confirmed live). Only accept exact-title matches.
  const normalize = (s) => (s || "").trim().toLowerCase();
  const candidates = results.filter(g => normalize(g.name) === normalize(item.title));
  if (!candidates.length) throw new Error("No exact match found on IGDB — try Search Online instead.");
  // A classic title can have several exact-title entries (one per port/
  // remaster) — narrow using platform and year together (both, when both
  // are available) rather than trusting either alone, since one signal
  // narrowing first can still land on the wrong release (confirmed live).
  let resolved = candidates;

  const PC_PLATFORMS = ["pc (microsoft windows)", "mac", "linux"];
  const isPcOwned = item.platform_id && (
    /^\d+$/.test(String(item.platform_id)) ||
    String(item.platform_id).startsWith("gog-") ||
    String(item.platform_id).startsWith("epic-")
  );
  const isPcPlatformed = (g) => (g.platforms || []).some(p => PC_PLATFORMS.includes(normalize(p.name)));
  const isYearMatch = (g) => g.first_release_date && new Date(g.first_release_date * 1000).getFullYear() === item.year;

  if (resolved.length > 1) {
    if (isPcOwned && item.year) {
      resolved = resolved.filter(g => isPcPlatformed(g) && isYearMatch(g));
    } else if (isPcOwned) {
      const pcMatches = candidates.filter(isPcPlatformed);
      if (pcMatches.length) resolved = pcMatches;
    } else if (item.year) {
      const yearMatches = candidates.filter(isYearMatch);
      if (yearMatches.length) resolved = yearMatches;
    }
  }
  if (resolved.length !== 1) throw new Error(`${candidates.length} exact matches found on IGDB, none confirmed by platform/year — try Search Online instead.`);
  const details = await igdbGameToItem(resolved[0]);
  // Only adopt IGDB's id if the item doesn't already have a real one —
  // platform_id doubles as the sync ownership id, and overwriting it broke
  // duplicate detection (confirmed live: re-imported as a "new" duplicate).
  if (item.platform_id) delete details.platform_id;
  return details;
}

// "Similar To" for a Game whose platform_id isn't a Steam appid — Steam's
// morelike scrape only works off a real appid (silently returns generic
// trending picks otherwise). IGDB's similar_games is real curated data.
async function getIgdbSimilarGames(igdbId, clientId, clientSecret) {
  if (!igdbId) return [];
  try {
    // Same version_parent swap as getIgdbSimilarGamesByTitle below — a
    // stored id can be an edition record, which has worse similar_games data.
    const parentLookup = await igdbQuery("games", `where id = ${parseInt(igdbId, 10)}; fields version_parent; limit 1;`, clientId, clientSecret);
    const resolvedId = parentLookup?.[0]?.version_parent || parseInt(igdbId, 10);
    const results = await igdbQuery("games", `where id = ${resolvedId}; fields similar_games.name,similar_games.cover.image_id,similar_games.first_release_date,similar_games.genres.name; limit 1;`, clientId, clientSecret);
    const similar = results?.[0]?.similar_games || [];
    return similar.slice(0, 12).map(g => ({
      id: g.id,
      mediaType: "Game",
      // Routes a click-through to search:details' IGDB branch, not Steam's.
      source: "igdb",
      title: g.name,
      year: g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : null,
      coverUrl: g.cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg` : null,
      genre: g.genres?.[0]?.name || null,
    }));
  } catch {
    return [];
  }
}

// Maps a developer name to an IGDB company id. Cached in memory per app
// run (misses too) so "More from Developer" stays inside the rate limit.
const igdbCompanyIdCache = new Map(); // lowercased name -> id | null

async function resolveIgdbCompanyId(name, clientId, clientSecret) {
  const key = name.trim().toLowerCase();
  if (igdbCompanyIdCache.has(key)) return igdbCompanyIdCache.get(key);

  const escaped = name.replace(/"/g, '\\"');
  let id = null;

  // Exact match first — `search` does NOT work on /companies (empty array).
  const exact = await igdbQuery("companies", `where name = "${escaped}"; fields id,name; limit 1;`, clientId, clientSecret);
  if (exact?.length) {
    id = exact[0].id;
  } else {
    // Umbrella brands aren't stored as-is (e.g. "Ubisoft" matches nothing,
    // only regional studios) — fuzzy contains catches those. Ranked by most
    // games developed, not shortest name, so it picks the recognisable
    // studio rather than a small support one or a junk copyright-string entry.
    const fuzzy = await igdbQuery("companies", `where name ~ *"${escaped}"*; fields id,name,developed; limit 30;`, clientId, clientSecret);
    if (fuzzy?.length) {
      const ranked = fuzzy
        .map(c => ({ id: c.id, count: (c.developed || []).length }))
        .filter(c => c.count > 0)
        .sort((a, b) => b.count - a.count);
      if (ranked.length) id = ranked[0].id;
    }
  }

  igdbCompanyIdCache.set(key, id);
  return id;
}

// "More from Developer" — no storefront supplies this; IGDB is the only
// source. Developer-only, not publisher (EA: 148 developed vs 1,607
// published — a publisher row would be noise). Falls back to IGDB's own
// developer credit when the store didn't supply one (found live: Epic's
// GraphQL returns null for some real offers).
async function resolveIgdbDeveloperByTitle(title, clientId, clientSecret) {
  const found = await igdbQuery("games", `search "${title.replace(/"/g, '\\"')}"; fields id,version_parent; limit 1;`, clientId, clientSecret);
  if (!found?.length) return null;
  const id = found[0].version_parent || found[0].id;
  const details = await igdbQuery("games", `where id = ${id}; fields involved_companies.company.name,involved_companies.developer; limit 1;`, clientId, clientSecret);
  return details?.[0]?.involved_companies?.find(c => c.developer)?.company?.name || null;
}

async function getIgdbMoreFromDeveloper(developer, excludeTitle, clientId, clientSecret) {
  let resolvedDeveloper = developer;
  if (!resolvedDeveloper && excludeTitle) {
    try {
      resolvedDeveloper = await resolveIgdbDeveloperByTitle(excludeTitle, clientId, clientSecret);
    } catch { /* falls through to the !developer check below */ }
  }
  if (!resolvedDeveloper) return [];
  try {
    const companyId = await resolveIgdbCompanyId(resolvedDeveloper, clientId, clientSecret);
    if (!companyId) return [];

    // game_type=0 → main games only (else DLC/re-releases fill the row);
    // version_parent → drops edition variants; sort rating desc → best-known
    // work first. Note: `category` (deprecated) fails silently, not loudly —
    // game_type is the current field name, don't revert it.
    const games = await igdbQuery(
      "games",
      `where involved_companies.company = ${companyId} & involved_companies.developer = true & version_parent = null & game_type = 0; fields name,first_release_date,cover.image_id,genres.name,rating; sort rating desc; limit 24;`,
      clientId, clientSecret
    );
    const exclude = (excludeTitle || "").trim().toLowerCase();
    // IGDB can list a title twice across separate entries — dedupe here.
    const seen = new Set();
    return (games || [])
      .filter(g => {
        if (!g.name) return false;
        const t = g.name.trim().toLowerCase();
        if (t === exclude || seen.has(t)) return false;
        seen.add(t);
        return true;
      })
      .slice(0, 12)
      .map(g => ({
        id: g.id,
        mediaType: "Game",
        source: "igdb", // routes click-through to search:details' IGDB branch
        title: g.name,
        year: g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : null,
        coverUrl: g.cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg` : null,
        genre: g.genres?.[0]?.name || null,
      }));
  } catch {
    return [];
  }
}

// Resolves a non-IGDB game to an IGDB id by title, for Similar To. Steam
// games don't come through here — they keep their own native scrape.
// Caches the id already resolved to its base game (see version_parent below).
const igdbGameIdByTitleCache = new Map(); // lowercased title -> id | null

async function getIgdbSimilarGamesByTitle(title, clientId, clientSecret) {
  if (!title) return [];
  const key = title.trim().toLowerCase();
  try {
    let igdbId;
    if (igdbGameIdByTitleCache.has(key)) {
      igdbId = igdbGameIdByTitleCache.get(key);
    } else {
      // A storefront's listing title is often the edition name, whose
      // similar_games data is poor — swapped to version_parent (base game)
      // whenever one exists, in the same request.
      const found = await igdbQuery("games", `search "${title.replace(/"/g, '\\"')}"; fields id,version_parent; limit 1;`, clientId, clientSecret);
      igdbId = found?.[0] ? (found[0].version_parent || found[0].id) : null;
      igdbGameIdByTitleCache.set(key, igdbId);
    }
    if (!igdbId) return [];

    const results = await igdbQuery("games", `where id = ${igdbId}; fields similar_games.name,similar_games.cover.image_id,similar_games.first_release_date,similar_games.genres.name; limit 1;`, clientId, clientSecret);
    const similar = results?.[0]?.similar_games || [];
    return similar.slice(0, 12).map(g => ({
      id: g.id,
      mediaType: "Game",
      source: "igdb",
      title: g.name,
      year: g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : null,
      coverUrl: g.cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg` : null,
      genre: g.genres?.[0]?.name || null,
    }));
  } catch {
    return [];
  }
}

return {
  searchIgdbGames,
  getIgdbGameDetailsById,
  fetchIgdbCoverArt,
  enrichGameItemViaIgdb,
  getIgdbSimilarGames,
  getIgdbMoreFromDeveloper,
  getIgdbSimilarGamesByTitle,
};

}; // end createIgdbService
