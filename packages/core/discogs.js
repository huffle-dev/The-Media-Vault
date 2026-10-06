// Discogs (Music) integration. discogsKey is passed explicitly — main.js
// owns settings access, keeping this module database-free.
//
// Factory (createDiscogsService(storage)) for the same reason as
// packages/core/movie.js — see that file's header comment.
const { parseDiscogsSearchResult, parseDiscogsRelease } = require("@media-vault/core/discogsParser");
const { fetchWithTimeout: fetch } = require("@media-vault/core/fetchWithTimeout");

// Works unauthenticated; a free token raises the rate limit and is
// required for search results to include a thumbnail at all.
const DISCOGS_HEADERS = { "User-Agent": "TheVault/1.0" };

module.exports = function createDiscogsService(storage) {

async function searchDiscogsReleases(query, discogsKey) {
  const url = `https://api.discogs.com/database/search?q=${encodeURIComponent(query)}&type=release`
    + (discogsKey ? `&token=${discogsKey}` : "");
  const res = await fetch(url, { headers: DISCOGS_HEADERS });
  if (!res.ok) throw new Error("Discogs search failed.");
  const data = await res.json();
  return (data.results || []).map(parseDiscogsSearchResult);
}

// A release by the barcode printed on the case (UPC / EAN).
async function searchDiscogsByBarcode(barcode, discogsKey) {
  const url = `https://api.discogs.com/database/search?barcode=${encodeURIComponent(barcode)}&type=release`
    + (discogsKey ? `&token=${discogsKey}` : "");
  const res = await fetch(url, { headers: DISCOGS_HEADERS });
  if (!res.ok) throw new Error("Discogs search failed.");
  const data = await res.json();
  return (data.results || []).map(parseDiscogsSearchResult);
}

// Shared by search:details (Music) and enrichMusicItem — fetches one
// release's full detail, downloads cover art, returns an item-shaped object.
async function fetchDiscogsReleaseDetails(releaseId, discogsKey) {
  const url = `https://api.discogs.com/releases/${releaseId}` + (discogsKey ? `?token=${discogsKey}` : "");
  const res = await fetch(url, { headers: DISCOGS_HEADERS });
  if (!res.ok) throw new Error("Release not found on Discogs.");
  const parsed = parseDiscogsRelease(await res.json());
  if (!parsed) throw new Error("Release not found on Discogs.");

  let cover_art_path = null;
  if (parsed.coverUrl) {
    try {
      const destPath = storage.joinPath(storage.coverArtDir(), `discogs-${releaseId}.jpg`);
      await storage.ensureImage(parsed.coverUrl, destPath, DISCOGS_HEADERS);
      cover_art_path = destPath;
    } catch { /* falls back to no art, same as other sources */ }
  }

  return {
    title:       parsed.title,
    creator:     parsed.creator,
    label:       parsed.label,
    genre:       parsed.genre,
    style:       parsed.style,
    album_type:  parsed.album_type,
    year:        parsed.year,
    cover_art_path,
    tracklist:   parsed.tracklist.length ? JSON.stringify(parsed.tracklist) : null,
    notes:       parsed.notes,
    country:     parsed.country,
    copyright:   parsed.copyright,
    runtime:     parsed.totalMinutes,
    discogs_rating:        parsed.communityRating,
    discogs_ratings_count: parsed.communityRatingCount,
    discogs_url:           parsed.storeUrl,
    metadata_checked_date: new Date().toISOString().split("T")[0],
  };
}

// Live "fetch info" for Music — resolves a release id via title search if
// missing, then fetches full details.
async function enrichMusicItem(item, discogsKey) {
  let platformId = item.platform_id || null;

  if (!platformId) {
    if (!item.title) throw new Error("No title to search with.");
    const url = `https://api.discogs.com/database/search?q=${encodeURIComponent(item.title)}&type=release`
      + (item.year ? `&year=${item.year}` : "")
      + (discogsKey ? `&token=${discogsKey}` : "");
    const res = await fetch(url, { headers: DISCOGS_HEADERS });
    if (!res.ok) throw new Error("Discogs search failed.");
    const data = await res.json();
    const match = data.results && data.results[0];
    if (!match) throw new Error("No match found on Discogs.");
    platformId = String(match.id);
  }

  const details = await fetchDiscogsReleaseDetails(platformId, discogsKey);
  return { ...details, media_type: "Music", platform_id: platformId };
}

// "More From Artist" — Discogs' real artist= filter. Each "release" is one
// specific pressing, not one row per album, so results are deduped by
// normalized album title. r.title arrives as "Artist - Album"; the artist
// prefix is stripped since the tile renders under a "More from" heading.
async function getMusicMoreFromArtist(artist, excludeTitle, discogsKey) {
  if (!artist) return [];
  try {
    const url = `https://api.discogs.com/database/search?artist=${encodeURIComponent(artist)}&type=release&per_page=50`
      + (discogsKey ? `&token=${discogsKey}` : "");
    const res = await fetch(url, { headers: DISCOGS_HEADERS });
    if (!res.ok) return [];
    const data = await res.json();
    const excludeNorm = (excludeTitle || "").trim().toLowerCase();
    const seen = new Set();
    const results = [];
    for (const r of data.results || []) {
      if (!r || !r.id || !r.title) continue;
      const albumTitle = r.title.includes(" - ") ? r.title.slice(r.title.indexOf(" - ") + 3) : r.title;
      const norm = albumTitle.trim().toLowerCase();
      if (norm === excludeNorm || seen.has(norm)) continue;
      seen.add(norm);
      results.push({
        id: r.id,
        mediaType: "Music",
        title: albumTitle,
        year: r.year || null,
        coverUrl: r.thumb || r.cover_image || null,
        genre: Array.isArray(r.genre) ? r.genre[0] : null,
      });
      if (results.length >= 12) break;
    }
    return results;
  } catch {
    return [];
  }
}

// "Similar To" — Discogs has no recommendation endpoint, but real genre+style
// filters give "other releases tagged the same way", same standard as Book's
// similarByGenre fallback.
async function getMusicSimilarByGenre(genre, style, excludePlatformId, discogsKey) {
  if (!genre) return [];
  try {
    // genre is a comma-separated string — only the first term is used.
    const firstGenre = genre.split(",")[0].trim();
    const firstStyle = style ? style.split(",")[0].trim() : null;
    const url = `https://api.discogs.com/database/search?genre=${encodeURIComponent(firstGenre)}`
      + (firstStyle ? `&style=${encodeURIComponent(firstStyle)}` : "")
      + `&type=release&per_page=30`
      + (discogsKey ? `&token=${discogsKey}` : "");
    const res = await fetch(url, { headers: DISCOGS_HEADERS });
    if (!res.ok) return [];
    const data = await res.json();
    const seen = new Set();
    const results = [];
    for (const r of data.results || []) {
      if (!r || !r.id || !r.title || String(r.id) === String(excludePlatformId)) continue;
      const norm = r.title.trim().toLowerCase();
      if (seen.has(norm)) continue;
      seen.add(norm);
      results.push({
        id: r.id,
        mediaType: "Music",
        title: r.title,
        year: r.year || null,
        coverUrl: r.thumb || r.cover_image || null,
        genre: Array.isArray(r.genre) ? r.genre[0] : null,
      });
      if (results.length >= 12) break;
    }
    return results;
  } catch {
    return [];
  }
}

return {
  searchDiscogsReleases,
  searchDiscogsByBarcode,
  fetchDiscogsReleaseDetails,
  enrichMusicItem,
  getMusicMoreFromArtist,
  getMusicSimilarByGenre,
};

}; // end createDiscogsService
