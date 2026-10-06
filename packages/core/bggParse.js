// Reading BoardGameGeek's own pages and endpoints (its public XML API is blocked), with no
// browser or Node in it, so the phone (mobile/bgg.js) can use it and test/bggParse.test.js
// covers it. Desktop's sync/bggApi.js has its own DOM-based reader of the same pages.
//
//   Search   geeksearch.php HTML       -> parseBggSearchHtml
//   Details  api.geekdo.com geekitems  -> buildBggDetails (+ dynamicinfo for the stats)
const { stripHtml } = require("./htmlText");

const decodeAttr = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");

// The results table of geeksearch.php: one row per game, with its link, name, year and thumbnail.
// Returns [{ platformId, title, type, storeUrl, storeLabel, thumbnailUrl }] (at most 24).
function parseBggSearchHtml(html) {
  const results = [];
  const seen = new Set();
  const rows = String(html || "").split(/<tr[\s>]/i).slice(1);
  for (const row of rows) {
    const cell = /<td[^>]*class=["'][^"']*collection_objectname[^"']*["'][^>]*>([\s\S]*?)<\/td>/i.exec(row);
    if (!cell) continue;
    const link = /<a[^>]+href=["']([^"']*\/(?:boardgame|boardgameexpansion|boardgameaccessory)\/(\d+)\/[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i.exec(cell[1]);
    if (!link) continue;
    const id = link[2];
    if (seen.has(id)) continue;
    const name = stripHtml(link[3]);
    if (!name) continue;
    seen.add(id);
    const yearCell = /class=["'][^"']*smallerfont[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div|p)>/i.exec(cell[1]);
    const yearMatch = yearCell && /(\d{4})/.exec(stripHtml(yearCell[1]));
    const year = yearMatch ? yearMatch[1] : null;
    const thumb = /<td[^>]*collection_thumbnail[^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/i.exec(row);
    const href = decodeAttr(link[1]);
    results.push({
      platformId: id,
      title: year ? `${name} (${year})` : name,
      type: "board game",
      storeUrl: href.startsWith("http") ? href : `https://boardgamegeek.com${href}`,
      storeLabel: "BGG ↗",
      thumbnailUrl: thumb ? decodeAttr(thumb[1]) : null,
    });
  }
  return results.slice(0, 24);
}

// A game's details from the geekitems JSON (`detail`) and, when it came back, the dynamicinfo
// JSON (`stats`: complexity, rating, rank). Same fields desktop saves.
function buildBggDetails(detail, stats, bggId, mediaType = "Board Game") {
  const it = detail && detail.item;
  if (!it) throw new Error("Item not found on BGG");

  const minPl = parseInt(it.minplayers || "0", 10);
  const maxPl = parseInt(it.maxplayers || "0", 10);
  const playerCount = (minPl && maxPl && minPl !== maxPl) ? `${minPl}–${maxPl}` : (minPl ? String(minPl) : (maxPl ? String(maxPl) : null));
  const playTime = parseInt(it.maxplaytime || "0", 10) || parseInt(it.minplaytime || "0", 10) || null;

  const links = it.links || {};
  const designer = links.boardgamedesigner?.[0]?.name || null;
  const category = links.boardgamecategory?.[0]?.name || null;

  const weightRaw = stats?.item?.stats?.avgweight;
  const weight = weightRaw ? parseFloat(weightRaw) : null;
  // The Bayesian average is BGG's own headline rating; the plain average is secondary.
  const bayes = stats?.item?.stats?.baverage;
  const bggRating = (bayes && parseFloat(bayes) > 0) ? parseFloat(parseFloat(bayes).toFixed(2)) : null;
  const ratedBy = stats?.item?.stats?.usersrated;
  // Only the overall "Board Game Rank" (rankobjecttype "subtype"); "Not Ranked" is not a number.
  const overall = stats?.item?.rankinfo?.find((r) => r.rankobjecttype === "subtype");
  const rankParsed = overall ? parseInt(overall.rank, 10) : NaN;

  const description = stripHtml(String(it.description || it.short_description || ""));

  return {
    title: it.name || "Unknown",
    media_type: mediaType,
    platform_id: String(bggId),
    bgg_url: `https://boardgamegeek.com/boardgame/${bggId}/`,
    year: it.yearpublished ? parseInt(it.yearpublished, 10) : null,
    creator: designer,
    genre: category,
    player_count: playerCount,
    play_time: playTime,
    complexity: (weight && weight > 0) ? parseFloat(weight.toFixed(2)) : null,
    bgg_rating: bggRating,
    bgg_rating_count: ratedBy ? parseInt(ratedBy, 10) : null,
    bgg_rank: Number.isFinite(rankParsed) ? rankParsed : null,
    notes: description ? description.slice(0, 1000) : null,
    _thumbnailUrl: it.imageurl || null,
    min_age: it.minage ? parseInt(it.minage, 10) : null,
    metadata_checked_date: new Date().toISOString().split("T")[0],
  };
}

module.exports = { parseBggSearchHtml, buildBggDetails };
