// Open Library (Book/Audiobook) integration. Database-free.
//
// Exported as a factory (createOpenLibraryService(storage)) for the same
// reason packages/core/movie.js is — see that file's header comment.
// enrichBookItem and resolveOpenLibraryBookDetails write a cover art file
// to disk; every other function here is pure and never touches storage.
const { parseOpenLibrarySearchResult, parseOpenLibraryWork } = require("@media-vault/core/openLibraryParser");
const { fetchWithTimeout: fetch } = require("@media-vault/core/fetchWithTimeout");

module.exports = function createOpenLibraryService(storage) {

// Prefers the most specific comma segment, skipping bare "Fiction"/
// "Nonfiction" buckets Open Library's subjects[0] sometimes returns.
function bestGenreSegment(genre) {
  const segments = genre.split(",").map(s => s.trim()).filter(Boolean);
  if (segments.length <= 1) return segments[0] || "";
  const specific = segments.filter(s => !/^(fiction|nonfiction|non-fiction)$/i.test(s));
  return (specific[0] || segments[0]);
}

// search:query (Book/Audiobook) — explicit fields= needed; publisher and
// number_of_pages_median are silently absent from the default response.
async function searchOpenLibrary(query, mediaType) {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=24&fields=key,title,author_name,first_publish_year,cover_i,publisher,language,number_of_pages_median,ebook_access,ia`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Open Library search failed.");
  const data = await res.json();
  return (data.docs || [])
    .map(parseOpenLibrarySearchResult)
    .filter(Boolean)
    .map(r => ({
      platformId:   r.platformId,
      title:        r.title,
      type:         mediaType === "Audiobook" ? "audiobook" : "book",
      storeUrl:     `https://openlibrary.org/works/${r.platformId}`,
      storeLabel:   "Open Library ↗",
      thumbnailUrl: r.thumbnailUrl,
      source:       "openlibrary",
      // Threaded to resolveOpenLibraryBookDetails — the work record itself
      // doesn't reliably carry these (all edition-level, aggregated here).
      year:         r.year,
      creator:      r.creator,
      publisher:    r.publisher,
      language:     r.language,
      pageCount:    r.pageCount,
      ebookUrl:     r.ebookUrl,
    }));
}

// coverArt:fetch (Book/Audiobook) — resolves a title to a cover image URL;
// the caller downloads it, same as every other source in that dispatcher.
async function findOpenLibraryCoverUrl(title) {
  const searchUrl = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=1`;
  const response  = await fetch(searchUrl);
  const data      = await response.json();

  if (!data.docs || data.docs.length === 0 || !data.docs[0].cover_i) {
    throw new Error("No cover found on Open Library");
  }

  const coverId = data.docs[0].cover_i;
  return `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
}

// Shared raw fetch for getBookSimilarByGenre and getBookRecommendations.
// sort=rating — the default order is dominated by old public-domain
// classics regardless of subject specificity (verified live); rating
// surfaces what's actually well-regarded instead.
async function fetchOpenLibrarySubjectWorks(slug, limit = 20) {
  const res = await fetch(`https://openlibrary.org/subjects/${encodeURIComponent(slug)}.json?limit=${limit}&sort=rating`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.works || [];
}

// "More Like This" — same subject-browse mechanism as getBookRecommendations,
// seeded from one item's genre instead of the library's top-rated list.
async function getBookSimilarByGenre(genre, excludeKey) {
  if (!genre) return [];
  const bestGenre = bestGenreSegment(genre);
  if (!bestGenre) return [];
  const slug = bestGenre.toLowerCase().replace(/\s+/g, "-");
  try {
    const works = await fetchOpenLibrarySubjectWorks(slug);
    return works
      .filter(w => w.key && w.title)
      .map(w => ({
        id: w.key.replace("/works/", ""),
        mediaType: "Book",
        title: w.title,
        year: w.first_publish_year || null,
        coverId: (typeof w.cover_id === "number" && w.cover_id > 0) ? w.cover_id : null,
        creator: w.authors?.[0]?.name || null,
      }))
      .filter(w => w.id !== excludeKey)
      .slice(0, 12);
  } catch {
    return [];
  }
}

// "More From [Author]" — no per-author id is stored (authors are a plain
// name string), so uses search.json's real `author=` fuzzy-name search.
async function getBookWorksByAuthor(creator, excludeKey) {
  if (!creator) return [];
  try {
    const res = await fetch(`https://openlibrary.org/search.json?author=${encodeURIComponent(creator)}&limit=20&fields=key,title,author_name,first_publish_year,cover_i`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.docs || [])
      .filter(w => w.key && w.title)
      .map(w => ({
        id: w.key.replace("/works/", ""),
        mediaType: "Book",
        title: w.title,
        year: w.first_publish_year || null,
        coverId: (typeof w.cover_i === "number" && w.cover_i > 0) ? w.cover_i : null,
        creator: w.author_name?.[0] || null,
      }))
      .filter(w => w.id !== excludeKey)
      .slice(0, 12);
  } catch {
    return [];
  }
}

// Open Library's own rating, looked up directly by work id. Never throws —
// a bonus stat, missing data shouldn't block adding the book.
async function fetchOpenLibraryRating(workId) {
  if (!workId) return null;
  try {
    const res = await fetch(`https://openlibrary.org/works/${workId}/ratings.json`);
    if (!res.ok) return null;
    const data = await res.json();
    const summary = data?.summary;
    if (!summary || summary.average == null) return null;
    return { rating: summary.average, ratingsCount: summary.count ?? null };
  } catch {
    return null;
  }
}

// Same title-search fallback as enrichMusicItem/enrichPodcastItem. Narrower
// than resolveOpenLibraryBookDetails — publisher/language/page-count/ebook
// link are edition-level and can't be safely re-derived here, so they're
// left out of the patch entirely (not nulled).
async function enrichBookItem(item) {
  // platform_id can be an Open Library work id, or an Audible ASIN (Libation
  // import). Only treat it as OL when it actually looks like one.
  const isOpenLibraryWorkId = /^OL\d+W$/.test(item.platform_id || "");
  let workId = isOpenLibraryWorkId ? item.platform_id : null;
  let creator = item.creator || null;

  if (!workId) {
    if (!item.title) throw new Error("No title to search with.");
    const res = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(item.title)}&limit=1&fields=key,author_name`);
    if (!res.ok) throw new Error("Open Library search failed.");
    const data = await res.json();
    const hit = data.docs?.[0];
    workId = hit?.key?.replace("/works/", "") || null;
    if (!workId) throw new Error("No match found on Open Library.");
    if (!creator && hit.author_name?.length) creator = hit.author_name[0];
  }

  const res = await fetch(`https://openlibrary.org/works/${workId}.json`);
  if (!res.ok) throw new Error("Book not found on Open Library.");
  const work = await res.json();
  const parsed = parseOpenLibraryWork(work);

  // The whole block is inside the try, not just the download/fileExists
  // calls — storage.joinPath/coverArtDir() themselves can throw (mobile's
  // storage is a Proxy that throws on every property access, since it
  // never fetches cover art at all), and a bug here previously let that
  // escape uncaught, failing the *entire* details fetch over a best-effort
  // art step.
  let cover_art_path = null;
  if (parsed.coverId) {
    try {
      const destPath = storage.joinPath(storage.coverArtDir(), `openlibrary-${workId}.jpg`);
      await storage.ensureImage(`https://covers.openlibrary.org/b/id/${parsed.coverId}-L.jpg`, destPath);
      cover_art_path = destPath;
    } catch { /* falls back to no art */ }
  }

  const openlibraryRating = await fetchOpenLibraryRating(workId);

  return {
    title:       parsed.title,
    // Only adopt the work id if the item doesn't already have a real one.
    platform_id: item.platform_id ? undefined : workId,
    creator:     creator || null,
    genre:       parsed.genre,
    notes:       parsed.description,
    cover_art_path,
    series_name: parsed.seriesName,
    tags:        parsed.tags,
    openlibrary_rating:        openlibraryRating?.rating ?? null,
    openlibrary_ratings_count: openlibraryRating?.ratingsCount ?? null,
  };
}

// Used by resolveSearchDetails for Search Online's add flow — has
// year/creator/publisher/etc. already resolved from the earlier search
// result, unlike enrichBookItem which only has the saved item.
async function resolveOpenLibraryBookDetails({ platformId, mediaType, creator, year, publisher, language, pageCount, ebookUrl }) {
  const res = await fetch(`https://openlibrary.org/works/${platformId}.json`);
  if (!res.ok) throw new Error("Book not found on Open Library.");
  const work = await res.json();
  const parsed = parseOpenLibraryWork(work);

  // See enrichBookItem above for why the whole block, not just the
  // download/fileExists calls, needs to be inside the try.
  let cover_art_path = null;
  if (parsed.coverId) {
    try {
      const destPath = storage.joinPath(storage.coverArtDir(), `openlibrary-${platformId}.jpg`);
      await storage.ensureImage(`https://covers.openlibrary.org/b/id/${parsed.coverId}-L.jpg`, destPath);
      cover_art_path = destPath;
    } catch { /* falls back to no art */ }
  }

  const openlibraryRating = await fetchOpenLibraryRating(platformId);

  return {
    title:       parsed.title,
    media_type:  mediaType,
    platform_id: platformId,
    // year/creator/publisher/language/pageCount/ebook_url all come from the
    // search result — edition-level fields the work record doesn't carry.
    creator:     creator || null,
    year:        year || null,
    genre:       parsed.genre,
    notes:       parsed.description,
    cover_art_path,
    publisher:    publisher || null,
    language:     language || null,
    // `runtime` means pages for Book but minutes for Audiobook — Open
    // Library has no audio-duration data, so it stays null for Audiobook.
    runtime:      mediaType === "Book" ? (pageCount || null) : null,
    series_name:  parsed.seriesName,
    tags:         parsed.tags,
    ebook_url:    ebookUrl || null,
    openlibrary_rating:        openlibraryRating?.rating ?? null,
    openlibrary_ratings_count: openlibraryRating?.ratingsCount ?? null,
  };
}

// Discovery's "Recommended For You" — seeded from every book the owner
// rated positively (stored rating >11 is above neutral — see
// packages/core/tokens/ratings.js), scored by how many different seeds a
// candidate shows up under, weighted by how much the owner liked each one.
// Same shape as movie.js's getMovieRecommendations, minus the no-key
// short-circuit (Open Library needs no key).
async function getBookRecommendations(items, dismissals) {
  const ownedBooks = items.filter(i => i.media_type === "Book" || i.media_type === "Audiobook");
  const ownedTitles = new Set(ownedBooks.map(i => (i.title || "").toLowerCase()));
  const ownedKeys = new Set(ownedBooks.map(i => i.platform_id).filter(Boolean));
  // discovery_dismissed's "tmdb_id" column is really just "external source
  // id" — reused here for Open Library work keys.
  const dismissedKeys = new Set(
    dismissals.filter(d => d.media_type === "Book").map(d => d.tmdb_id)
  );

  const liked = ownedBooks.filter(i => i.rating != null && i.rating > 11 && i.genre);
  // Up from a top-10 cap, same reasoning as getMovieRecommendations: a
  // well-rated library was leaving most of what you liked unused as a seed.
  const seeds = liked.sort((a, b) => b.rating - a.rating).slice(0, 30);
  if (!seeds.length) return { items: [], reason: "no_seeds" };

  // Multiple seeds sharing a genre used to mean genuinely duplicate Open
  // Library queries — a real ceiling on the pool's size when someone's
  // best-rated books cluster into just one or two genres, found live once
  // the seed cap above was raised (a bigger seed list made no difference to
  // "Show More" if it was still fanning out to the same handful of
  // subjects). Seeds are grouped by slug first, so each distinct genre is
  // only ever fetched once, and its weight is every seed in that group
  // combined — asking for more works per call to compensate for fewer
  // distinct queries.
  const bySlug = new Map(); // slug -> { weight, seedTitle (highest-weighted) }
  for (const seed of seeds) {
    const genre = bestGenreSegment(seed.genre);
    if (!genre) continue;
    const slug = genre.toLowerCase().replace(/\s+/g, "-");
    const weight = seed.rating - 11;
    const existing = bySlug.get(slug);
    if (!existing) { bySlug.set(slug, { genre, weight, seedTitle: seed.title }); continue; }
    existing.weight += weight;
    if (weight > (existing.topWeight ?? 0)) { existing.topWeight = weight; existing.seedTitle = seed.title; }
  }

  const scored = new Map();
  await Promise.all([...bySlug.entries()].map(async ([slug, { genre, weight, seedTitle }]) => {
    try {
      const works = await fetchOpenLibrarySubjectWorks(slug, 40);
      for (const w of works) {
        if (!w.key || !w.title) continue;
        const key = w.key.replace("/works/", "");
        if (ownedTitles.has(w.title.toLowerCase()) || ownedKeys.has(key) || dismissedKeys.has(key)) continue;
        const existing = scored.get(key);
        if (existing) { existing.score += weight; continue; }
        scored.set(key, {
          id: key,
          mediaType: "Book",
          title: w.title,
          year: w.first_publish_year || null,
          coverId: (typeof w.cover_id === "number" && w.cover_id > 0) ? w.cover_id : null,
          creator: w.authors?.[0]?.name || null,
          genre,
          because: seedTitle,
          score: weight,
        });
      }
    } catch { /* this genre failed to fetch — others may still succeed */ }
  }));

  const ranked = [...scored.values()].sort((a, b) => b.score - a.score);
  return { items: ranked.slice(0, 100), reason: null };
}

return {
  bestGenreSegment,
  searchOpenLibrary,
  findOpenLibraryCoverUrl,
  fetchOpenLibrarySubjectWorks,
  getBookSimilarByGenre,
  getBookRecommendations,
  getBookWorksByAuthor,
  fetchOpenLibraryRating,
  enrichBookItem,
  resolveOpenLibraryBookDetails,
};

}; // end createOpenLibraryService
