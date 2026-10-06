// BoardGameGeek integration.
//
// BGG's public XML API (xmlapi / xmlapi2) is now blanket-blocked behind
// Cloudflare and returns HTTP 401 "Unauthorized" to every request — even a
// same-origin, cookie-bearing fetch from a real browser session. So instead we
// use the endpoints the site itself uses:
//
//   Search   geeksearch.php  → server-rendered HTML; parse the results table
//                              (deterministic, unlike the /search/boardgame JSON
//                              route which flip-flops between JSON and the
//                              Angular HTML shell under repeated requests).
//   Details  api.geekdo.com/api/geekitems    → JSON
//   Stats    api.geekdo.com/api/dynamicinfo  → JSON (complexity/avgweight)
//
// The actual network requests run in the main process inside a hidden
// boardgamegeek.com window (see main.js bgg:* handlers) because Cloudflare 403s
// cookieless file:// fetches. Here we only shape the query and parse responses.

// Strip BGG's HTML-formatted description down to plain text (runs in renderer).
function htmlToText(html) {
  if (!html) return "";
  const el = document.createElement("div");
  el.innerHTML = String(html);
  return (el.textContent || el.innerText || "").replace(/\s+/g, " ").trim();
}

export async function bggSearch(query) {
  let html;
  try {
    html = await window.vault.bgg.searchText(query);
  } catch (err) {
    throw new Error(`BGG search failed (${(err && err.message) || "network error"}). Try again in a moment.`);
  }
  const doc = new DOMParser().parseFromString(html, "text/html");

  const results = [];
  const seen = new Set();
  for (const cell of doc.querySelectorAll("td.collection_objectname")) {
    const link = cell.querySelector("a[href*='/boardgame']");
    if (!link) continue;
    const m = link.getAttribute("href").match(/\/(boardgame|boardgameexpansion|boardgameaccessory)\/(\d+)\//);
    if (!m) continue;
    const id = m[2];
    if (seen.has(id)) continue;
    seen.add(id);

    const name    = link.textContent.trim();
    const yearEl  = cell.querySelector(".smallerfont");
    const yearM   = yearEl && yearEl.textContent.match(/(\d{4})/);
    const year    = yearM ? yearM[1] : null;
    if (!name) continue;

    // The sibling thumbnail cell in the same row carries a micro cover image.
    const row      = cell.closest("tr");
    const thumbImg = row && row.querySelector("td.collection_thumbnail img");
    const thumbUrl = thumbImg ? thumbImg.getAttribute("src") : null;

    results.push({
      platformId:   id,
      title:        year ? `${name} (${year})` : name,
      type:         "board game",
      storeUrl:     `https://boardgamegeek.com${link.getAttribute("href")}`,
      storeLabel:   "BGG ↗",
      thumbnailUrl: thumbUrl,
    });
  }
  return results.slice(0, 24);
}

export async function bggDetails(bggId, mediaType = "Board Game") {
  const [detail, stats] = await Promise.all([
    window.vault.bgg.itemJson(bggId),
    window.vault.bgg.statsJson(bggId).catch(() => null),
  ]);

  const it = detail && detail.item;
  if (!it) throw new Error("Item not found on BGG");

  const minPl = parseInt(it.minplayers || "0", 10);
  const maxPl = parseInt(it.maxplayers || "0", 10);
  const playerCount = (minPl && maxPl && minPl !== maxPl)
    ? `${minPl}–${maxPl}`
    : (minPl ? String(minPl) : (maxPl ? String(maxPl) : null));

  const playTime = parseInt(it.maxplaytime || "0", 10) || parseInt(it.minplaytime || "0", 10) || null;

  const links     = it.links || {};
  const designer  = links.boardgamedesigner?.[0]?.name || null;
  const category  = links.boardgamecategory?.[0]?.name || null;

  const weightRaw = stats?.item?.stats?.avgweight;
  const weight    = weightRaw ? parseFloat(weightRaw) : null;

  // Bayesian average (BGG's own "the rating" shown on every game page —
  // the raw arithmetic `average` is a secondary stat, not what BGG itself
  // displays prominently), verified live against a real item's response.
  const bggRatingRaw = stats?.item?.stats?.baverage;
  const bggRating = (bggRatingRaw && parseFloat(bggRatingRaw) > 0) ? parseFloat(parseFloat(bggRatingRaw).toFixed(2)) : null;
  const bggRatingCountRaw = stats?.item?.stats?.usersrated;
  const bggRatingCount = bggRatingCountRaw ? parseInt(bggRatingCountRaw, 10) : null;
  // Only the overall "Board Game Rank" entry (rankobjecttype "subtype"), not
  // the secondary category ranks (Strategy Rank, etc.) also present here.
  // BGG returns the string "Not Ranked" instead of a number for items with
  // too few ratings to qualify.
  const overallRankEntry = stats?.item?.rankinfo?.find(r => r.rankobjecttype === "subtype");
  const bggRankParsed = overallRankEntry ? parseInt(overallRankEntry.rank, 10) : NaN;
  const bggRank = Number.isFinite(bggRankParsed) ? bggRankParsed : null;

  const description = htmlToText(it.description || it.short_description || "");
  const minAge = it.minage ? parseInt(it.minage, 10) : null;

  const base = {
    title:         it.name || "Unknown",
    media_type:    mediaType,
    platform_id:   String(bggId),
    bgg_url:       `https://boardgamegeek.com/boardgame/${bggId}/`,
    year:          it.yearpublished ? parseInt(it.yearpublished, 10) : null,
    creator:       designer,
    genre:         category,
    player_count:  playerCount,
    play_time:     playTime,
    complexity:    (weight && weight > 0) ? parseFloat(weight.toFixed(2)) : null,
    bgg_rating:       bggRating,
    bgg_rating_count: bggRatingCount,
    bgg_rank:         bggRank,
    notes:         description ? description.slice(0, 1000) : null,
    _thumbnailUrl: it.imageurl || null,
    metadata_checked_date: new Date().toISOString().split("T")[0],
  };

  return { ...base, min_age: minAge };
}
