// Audible integration — search and get-full-details. audible:enrichCovers
// stays in main.js (a DB-writing bulk loop, not a pure API call). Factory
// (createAudibleService(storage)) — see packages/core/movie.js's header
// comment for why.

const { stripHtml } = require("@media-vault/core/htmlText");

// Which search result is "the same audiobook" as `title`, and its cover. Used
// when an audiobook has no Audible id (so no direct lookup): the first result
// whose title matches ignoring case, punctuation and a leading "The"; a search
// that only turns up different titles gives null rather than a wrong cover.
const normTitle = (t) => String(t || "").toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, " ").trim();
// "Dune: Book One" -> "Dune". Only a real subtitle separator counts, so
// "Dune Messiah" is never mistaken for "Dune".
const mainTitle = (t) => String(t || "").split(/\s*(?::|–|—|\s-\s)\s*/)[0];
function pickAudibleCoverUrl(results, title) {
  const want = normTitle(title);
  if (!want) return null;
  const wantMain = normTitle(mainTitle(title));
  const hit = (results || []).find((r) => {
    if (!r.thumbnailUrl) return false;
    const got = normTitle(r.title);
    return got === want || normTitle(mainTitle(r.title)) === want || got === wantMain;
  });
  return hit ? hit.thumbnailUrl : null;
}
const { fetchWithTimeout: fetch } = require("@media-vault/core/fetchWithTimeout");

module.exports = function createAudibleService(storage) {

// Audible catalog search, free/keyless. Uses the same `audible-<ASIN>`
// platform_id the Libation import writes, so the two de-duplicate.
async function searchAudibleBooks(query) {
  const url = `https://api.audible.com/1.0/catalog/products?keywords=${encodeURIComponent(query)}&num_results=24&response_groups=product_desc,media,contributors`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Audible search failed.");
  const data = await res.json();
  return (data.products || [])
    .filter(p => p.asin && p.title)
    .map(p => ({
      platformId:   p.asin,
      title:        p.title,
      type:         "audiobook",
      storeUrl:     `https://www.audible.com/pd/${p.asin}`,
      storeLabel:   "Audible ↗",
      thumbnailUrl: p.product_images?.["500"] || p.product_images?.["300"] || null,
      source:       "audible",
      creator:      (p.authors || []).map(a => a.name).join(", ") || null, // threaded to search:details
      year:         p.release_date ? parseInt(p.release_date.slice(0, 4), 10) : null,
    }));
}

// search:details' Audible branch — full title details for a chosen search
// result.
async function getAudibleBookDetails(platformId) {
  const res = await fetch(`https://api.audible.com/1.0/catalog/products/${platformId}?response_groups=product_desc,media,contributors,series,category_ladders`);
  if (!res.ok) throw new Error("Title not found on Audible.");
  const data = await res.json();
  const p = data.product;
  if (!p) throw new Error("Title not found on Audible.");

  let cover_art_path = null;
  const imageUrl = p.product_images?.["500"] || p.product_images?.["300"];
  if (imageUrl) {
    try {
      const destPath = storage.joinPath(storage.coverArtDir(), `audible-${platformId}.jpg`);
      await storage.ensureImage(imageUrl, destPath);
      cover_art_path = destPath;
    } catch { /* falls back to no art */ }
  }

  // A title can belong to multiple series listings — takes the first.
  const primarySeries = p.series?.[0];
  // Most specific (last) node in the first category ladder as "genre".
  const ladder = p.category_ladders?.[0]?.ladder;
  const primaryGenre = ladder?.length ? ladder[ladder.length - 1].name : null;

  return {
    title:        p.title,
    media_type:   "Audiobook",
    platform_id:  `audible-${platformId}`,
    creator:      (p.authors || []).map(a => a.name).join(", ") || null,
    narrator:     (p.narrators || []).map(n => n.name).join(", ") || null,
    publisher:    p.publisher_name || null,
    runtime:      p.runtime_length_min || null,
    year:         p.release_date ? parseInt(p.release_date.slice(0, 4), 10) : null,
    genre:        primaryGenre,
    notes:        p.publisher_summary ? stripHtml(p.publisher_summary) : (p.merchandising_summary ? stripHtml(p.merchandising_summary) : null),
    series_name:  primarySeries?.title || null,
    series_order: primarySeries?.sequence ? (parseInt(primarySeries.sequence, 10) || null) : null,
    cover_art_path,
  };
}

// "More From [Author]" for an Audiobook's profile — Audible's own catalog
// filtered by author, so every tile is a real audiobook that can be added
// (an Open Library author search returns bibliographic works with no
// Audible id). `excludePlatformId` is the item's own id ("audible-<ASIN>").
async function getAudibleMoreFromAuthor(author, excludePlatformId) {
  if (!author) return [];
  try {
    const excludeAsin = String(excludePlatformId || "").replace(/^audible-/, "");
    const res = await fetch(`https://api.audible.com/1.0/catalog/products?author=${encodeURIComponent(author)}&num_results=30&response_groups=product_desc,media,contributors,category_ladders,product_attrs`);
    if (!res.ok) return [];
    const data = await res.json();
    const seen = new Set();
    const works = [];
    for (const p of data.products || []) {
      if (!p.asin || !p.title || p.asin === excludeAsin) continue;
      // Only titles this author is actually credited on — the filter is
      // fuzzy, and a foreign-language edition repeats the same title.
      if (!(p.authors || []).some(a => (a.name || "").toLowerCase() === author.toLowerCase())) continue;
      // The catalog ignores a language filter, so foreign-language editions
      // (same author credited) come back mixed in — keep English ones only.
      if ((p.language || "english").toLowerCase() !== "english") continue;
      const norm = p.title.trim().toLowerCase();
      if (seen.has(norm)) continue;
      seen.add(norm);
      const ladder = p.category_ladders?.[0]?.ladder;
      works.push({
        id: p.asin,
        mediaType: "Audiobook",
        title: p.title,
        year: p.release_date ? parseInt(p.release_date.slice(0, 4), 10) : null,
        coverUrl: p.product_images?.["500"] || p.product_images?.["300"] || null,
        genre: ladder?.length ? ladder[ladder.length - 1].name : null,
        creator: author,
      });
      if (works.length >= 12) break;
    }
    return works;
  } catch {
    return [];
  }
}

return { searchAudibleBooks, getAudibleBookDetails, getAudibleMoreFromAuthor, pickAudibleCoverUrl };

}; // end createAudibleService

// The pure matcher needs no storage (tests, callers without a service).
module.exports.pickAudibleCoverUrl = pickAudibleCoverUrl;
