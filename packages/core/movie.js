// Movie/TV (TMDB-only) integration. Takes tmdbKey as a parameter — main.js
// owns settings access, keeping this module database-free. (OMDB, the
// original fallback source, was removed 2026-09-23 — TMDB alone covers
// search/details/cover art now. A handful of functions still resolve a
// legacy OMDB-shaped IMDb id — e.g. "tt1234567" — to a TMDB id via a direct
// lookup, since some items in older libraries still carry one; that lookup
// uses only TMDB's own API and needs no OMDB key.)
//
// Exported as a factory (createMovieService(storage)) rather than plain
// functions, because 3 of them write a cover art file to disk — real fs/
// path work that only exists on desktop (Node's fs, Electron's userData
// path), which would break Metro's bundling outright if required directly
// here: unlike a lazy/conditional require, Metro resolves every literal
// require(...) string into its dependency graph at bundle time regardless
// of whether the code path actually runs, so even an unreached
// require("../lib/appPaths") would fail the whole mobile bundle (it
// requires "electron", which doesn't exist there) — this bit us for real
// once already, in packages/core/pathSafety.js's require("path"). The
// `storage` parameter is that boundary made explicit: desktop's main.js
// passes the real coverArtDir/downloadImage/fs implementations; mobile
// (which doesn't fetch cover art yet — a separate future increment using
// Expo's FileSystem, an entirely different API, not a shared one) can pass
// a storage that throws, since it never calls the 3 functions that use it.
const { slugify } = require("@media-vault/core/format");
const { parseTmdbRating } = require("@media-vault/core/ratingParsers");
const { fetchWithTimeout: fetch } = require("@media-vault/core/fetchWithTimeout");

module.exports = function createMovieService(storage) {

// coverArt:fetch (Movie/TV) — TMDB only. Downloads directly into destPath
// (the caller's stable-filename convention), returning that same path on
// success.
async function fetchMovieCoverArt(mediaType, title, year, destPath, tmdbKey) {
  if (!tmdbKey) {
    throw new Error("No TMDB key set — add one in Settings ⚙ to enable automatic cover art.");
  }

  const kind = mediaType === "Movie" ? "movie" : "tv";
  const search = async (query, withYear) => {
    const url = `https://api.themoviedb.org/3/search/${kind}?api_key=${tmdbKey}&query=${encodeURIComponent(query)}`
      + (withYear && year ? `&${kind === "movie" ? "year" : "first_air_date_year"}=${year}` : "");
    const data = await (await fetch(url)).json();
    return (data.results || [])[0] || null;
  };
  const save = async (match) => {
    await storage.downloadImage(`https://image.tmdb.org/t/p/w780${match.poster_path}`, destPath);
    return destPath;
  };

  // 1. The title as saved, narrowed by year.
  let match = await search(title, true);
  if (match && match.poster_path) return save(match);

  // 2. Without the year — a source's year can differ from TMDB's by one, and
  //    TMDB's year filter returns nothing rather than the nearest.
  if (year) {
    match = await search(title, false);
    if (match && match.poster_path) return save(match);
  }

  // 3. "Show: Episode title" / "Show - Episode title" — an episode or special
  //    saved under the show's name. Search just the show, but only accept a
  //    result whose own title IS that show name, so "Cold War: Comrades" never
  //    takes the poster of some other "Cold War".
  const head = String(title).split(/\s*(?::|\u2013|\u2014|\s-\s)\s*/)[0].trim();
  if (head.length >= 3 && head !== title) {
    match = await search(head, false);
    const norm = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const names = match ? [match.title, match.name, match.original_title, match.original_name].map(norm) : [];
    if (match && match.poster_path && names.includes(norm(head))) return save(match);
  }

  throw new Error("TMDB found nothing for this title — try uploading art manually.");
}

// search:query (Movie/TV) — TMDB only.
// `year` (optional, from the browser extension's vault:// link) narrows the
// search to that release year and floats exact-year matches to the top.
// TMDB's year filter is fuzzy (a wrong year returns unrelated titles rather
// than nothing), so the narrowed results are only used when one of them
// matches both the year and the title; otherwise it falls back to the plain
// search — a source's year can differ from TMDB's by one.
async function searchMovieTv(query, mediaType, tmdbKey, year) {
  if (!year) return searchMovieTvInner(query, mediaType, tmdbKey, null);
  const yearTag = `(${year})`;
  const rank = (list) => [...list.filter(r => r.title.includes(yearTag)), ...list.filter(r => !r.title.includes(yearTag))];
  const q = query.toLowerCase();
  const narrowed = await searchMovieTvInner(query, mediaType, tmdbKey, year);
  if (narrowed.some(r => r.title.includes(yearTag) && r.title.toLowerCase().includes(q))) return rank(narrowed);
  return rank(await searchMovieTvInner(query, mediaType, tmdbKey, null));
}

async function searchMovieTvInner(query, mediaType, tmdbKey, yearFilter) {
  const kind = mediaType === "Movie" ? "movie" : "tv";

  if (!tmdbKey) {
    throw new Error("No TMDB API key set — add one in Settings ⚙ to search for movies and TV shows.");
  }

  const yearParam = yearFilter ? `&${kind === "movie" ? "year" : "first_air_date_year"}=${encodeURIComponent(yearFilter)}` : "";
  const url  = `https://api.themoviedb.org/3/search/${kind}?api_key=${tmdbKey}&query=${encodeURIComponent(query)}${yearParam}`;
  const res  = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(`TMDB search failed: ${data.status_message || `HTTP ${res.status}`}`);

  return (data.results || []).map(it => {
    const name = it.title || it.name || "";
    const dateStr = it.release_date || it.first_air_date || "";
    const year = dateStr.slice(0, 4);
    return {
      platformId:   String(it.id),
      title:        year ? `${name} (${year})` : name,
      type:         mediaType === "Movie" ? "movie" : "tv",
      storeUrl:     `https://www.themoviedb.org/${kind}/${it.id}`,
      storeLabel:   "TMDB ↗",
      thumbnailUrl: it.poster_path ? `https://image.tmdb.org/t/p/w342${it.poster_path}` : null,
      source:       "tmdb",
    };
  }).filter(r => r.title).slice(0, 24);
}

async function fetchTmdbMovieDetails(mediaType, platformId, tmdbKey) {
  const kind = mediaType === "Movie" ? "movie" : "tv";
  const ratingsAppend = mediaType === "Movie" ? "release_dates" : "content_ratings";
  const url  = `https://api.themoviedb.org/3/${kind}/${platformId}?api_key=${tmdbKey}&append_to_response=credits,external_ids,videos,${ratingsAppend}`;
  const res  = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(`TMDB details failed: ${data.status_message || res.status}`);

  // Prefer an official "Trailer", fall back to any YouTube video (e.g. a Teaser).
  const videos = data.videos?.results || [];
  const trailer = videos.find(v => v.site === "YouTube" && v.type === "Trailer")
    || videos.find(v => v.site === "YouTube");
  const trailerUrl = trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null;

  // US certification — movies list several release events per country (only
  // some carry a certification); TV is a flat {country, rating} list.
  let contentRating = null;
  if (mediaType === "Movie") {
    const usEntry = data.release_dates?.results?.find(r => r.iso_3166_1 === "US");
    const withCert = usEntry?.release_dates?.find(rd => rd.certification);
    contentRating = withCert?.certification || null;
  } else {
    const usEntry = data.content_ratings?.results?.find(r => r.iso_3166_1 === "US");
    contentRating = usEntry?.rating || null;
  }

  const name    = data.title || data.name || "Unknown";
  const dateStr = data.release_date || data.first_air_date || "";
  const year    = dateStr ? parseInt(dateStr.slice(0, 4), 10) : null;
  const imdbId  = data.external_ids?.imdb_id || null;

  const creator = mediaType === "Movie"
    ? (data.credits?.crew?.find(c => c.job === "Director")?.name || null)
    : (data.created_by?.[0]?.name || null);

  const runtime = mediaType === "Movie"
    ? (data.runtime || null)
    : (data.episode_run_time?.[0] || null);
  const imdb_url = imdbId ? `https://www.imdb.com/title/${imdbId}/` : null;

  const country  = data.production_countries?.map(c => c.name).join(", ") || null;
  const language = data.spoken_languages?.length
    ? data.spoken_languages.map(l => l.english_name || l.name).join(", ")
    : (data.original_language ? data.original_language.toUpperCase() : null);
  // JSON keeps character + profile_path (hotlinked, not downloaded) per cast member.
  const castList = data.credits?.cast?.length
    ? JSON.stringify(data.credits.cast.slice(0, 6).map(c => ({
        name: c.name, character: c.character || null, profile_path: c.profile_path || null,
      })))
    : null;
  // TMDB-sourced items never have RT/Metacritic (OMDB-only).
  const { criticRating, tmdb_rating: tmdbRatingNum, tmdb_votes: tmdbVotesNum } = parseTmdbRating(data);

  const seriesName = mediaType === "Movie" ? (data.belongs_to_collection?.name || null) : null;

  // Download now, using the same stable-filename scheme coverArt:fetch uses.
  let cover_art_path = null;
  if (data.poster_path) {
    // The whole block is inside the try, not just the download/fileExists
    // calls — storage.joinPath/coverArtDir() themselves can throw (mobile's
    // storage is a Proxy that throws on every property access, since it
    // never fetches cover art at all), and a bug here previously let that
    // escape uncaught, failing the *entire* details fetch over a
    // best-effort art step. Found live: every mobile preview (any type)
    // failed with "Cover art isn't fetched on mobile yet." instead of
    // showing details with just no art.
    try {
      const stableFilename = imdbId ? `${imdbId}.jpg` : `${slugify(name)}-${year || "unknown"}.jpg`;
      const destPath = storage.joinPath(storage.coverArtDir(), stableFilename);
      await storage.ensureImage(`https://image.tmdb.org/t/p/w780${data.poster_path}`, destPath);
      cover_art_path = destPath;
    } catch { /* Add modal falls back to background art fetch */ }
  }

  // TMDB has no RT/Metacritic — imdb_rating/rotten_tomatoes_rating/
  // metacritic_rating are simply left unset for TMDB-sourced items (OMDB,
  // which used to supply a supplementary lookup for these, was removed
  // 2026-09-23; see BACKLOG.md). They remain real database columns and
  // still display for legacy items that already have them.
  return {
    title:      name,
    media_type: mediaType,
    platform_id: String(platformId),
    year,
    genre:      data.genres?.map(g => g.name).join(", ") || null,
    creator,
    country,
    language,
    cast_list:     castList,
    critic_rating: criticRating,
    tmdb_rating: tmdbRatingNum,
    tmdb_votes: tmdbVotesNum,
    content_rating: contentRating,
    trailer_url: trailerUrl,
    series_name: seriesName,
    network:    mediaType === "TV" ? (data.networks?.[0]?.name || null) : undefined,
    season_count: mediaType === "TV" ? (data.number_of_seasons || null) : undefined,
    runtime,
    imdb_url,
    notes:      data.overview || null,
    cover_art_path,
    metadata_checked_date: new Date().toISOString().split("T")[0],
  };
}

// Resolves an OMDB-shaped IMDb id to a TMDB numeric id — TMDB's endpoints
// only accept their own id. Shared by enrichMovieItem/checkWatchProviders.
async function resolveTmdbIdFromImdb(mediaType, imdbId, tmdbKey) {
  try {
    const res  = await fetch(`https://api.themoviedb.org/3/find/${imdbId}?api_key=${tmdbKey}&external_source=imdb_id`);
    const data = await res.json();
    const results = mediaType === "Movie" ? data.movie_results : data.tv_results;
    return results && results[0] ? String(results[0].id) : null;
  } catch {
    return null;
  }
}

// Enrich an existing item missing metadata. TMDB is the only source; an
// item still carrying a legacy OMDB-shaped IMDb id (e.g. "tt1234567", from
// before OMDB was removed 2026-09-23) gets that id upgraded to TMDB's own
// id via a direct IMDb-id lookup first — never a fuzzy title search, and
// never requires an OMDB key, since it's TMDB's own API doing the lookup.
async function enrichMovieItem(item, tmdbKey) {
  if (!tmdbKey) throw new Error("No TMDB API key set — add one in Settings ⚙ to fetch metadata.");

  const mediaType = item.media_type;
  let platformId = item.platform_id || null;
  const isLegacyImdbId = platformId && /^tt\d+$/.test(platformId);

  if (isLegacyImdbId) {
    const resolved = await resolveTmdbIdFromImdb(mediaType, platformId, tmdbKey);
    if (!resolved) {
      throw new Error("This item has a legacy IMDb ID that TMDB couldn't match automatically — try Fetch Info again later, or edit the title/year and retry.");
    }
    platformId = resolved;
  } else if (!platformId) {
    const kind = mediaType === "Movie" ? "movie" : "tv";
    const yearParam = item.year ? `&${kind === "movie" ? "year" : "first_air_date_year"}=${item.year}` : "";
    try {
      const res  = await fetch(`https://api.themoviedb.org/3/search/${kind}?api_key=${tmdbKey}&query=${encodeURIComponent(item.title)}${yearParam}`);
      const data = await res.json();
      const match = data.results && data.results[0];
      if (match) platformId = String(match.id);
    } catch { /* falls through to "No match found" below */ }
  }

  if (!platformId) throw new Error("No match found");

  const idUpgraded = item.platform_id && item.platform_id !== platformId;
  const details = await fetchTmdbMovieDetails(mediaType, platformId, tmdbKey);
  if (idUpgraded) details._idUpgraded = true;
  return details;
}

// TMDB's actual supported watch-provider regions (verified against their API docs).
const TMDB_WATCH_REGIONS = [
  "AE","AL","AR","AT","AU","BA","BB","BE","BG","BH","BO","BR","BS","CA","CH","CL","CO","CR",
  "CV","CZ","DE","DK","DO","EC","EE","EG","ES","FI","FJ","FR","GB","GF","GI","GR","GT","HK",
  "HN","HR","HU","ID","IE","IL","IN","IQ","IS","IT","JM","JO","JP","KR","KW","LB","LI","LT",
  "LV","MD","MK","MT","MU","MX","MY","MZ","NL","NO","NZ","OM","PA","PE","PH","PK","PL","PS",
  "PT","PY","QA","RO","RS","RU","SA","SE","SG","SI","SK","SM","SV","TH","TR","TT","TW","UG",
  "US","UY","VE","YE","ZA",
];

// movie:watchRegions — pure, no db dependency.
function getWatchRegionOptions() {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  return TMDB_WATCH_REGIONS
    .map(code => ({ code, name: names.of(code) || code }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Fetches every provider for every country in one call (cached whole, so
// switching the Settings region never needs a re-fetch). `link` is TMDB's
// own JustWatch-style watch page — the one clickable URL the API returns.
async function fetchWatchProviders(mediaType, tmdbId, tmdbKey) {
  const kind = mediaType === "Movie" ? "movie" : "tv";
  const res  = await fetch(`https://api.themoviedb.org/3/${kind}/${tmdbId}/watch/providers?api_key=${tmdbKey}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.status_message || `HTTP ${res.status}`);

  const namesOf = (bucket) => (bucket || []).map(p => p.provider_name);
  const byCountry = {};
  for (const [country, regionData] of Object.entries(data.results || {})) {
    byCountry[country] = {
      flatrate: namesOf(regionData.flatrate),
      rent:     namesOf(regionData.rent),
      buy:      namesOf(regionData.buy),
      // Merges TMDB's "free" and "ads" categories — found live a title had
      // only "ads" providers, showing nothing under flatrate/rent/buy.
      free:     [...new Set([...namesOf(regionData.free), ...namesOf(regionData.ads)])],
      link:     regionData.link || null,
    };
  }
  return byCountry;
}

// Real provider list for a region, for the Settings checklist. Movie and TV
// lists overlap but aren't identical, so both are fetched and merged.
async function getMovieProviderOptions(region, tmdbKey) {
  if (!tmdbKey) return [];

  const fetchList = async (kind) => {
    const res  = await fetch(`https://api.themoviedb.org/3/watch/providers/${kind}?api_key=${tmdbKey}&watch_region=${region}`);
    const data = await res.json();
    return data.results || [];
  };
  // Priority is region-specific (display_priorities[region]), falling back to
  // the flat display_priority field some responses include as a default.
  const priorityOf = (p, r) => p.display_priorities?.[r] ?? p.display_priority ?? 999;

  const [movies, tv] = await Promise.all([fetchList("movie"), fetchList("tv")]);
  const byId = new Map();
  for (const p of [...movies, ...tv]) {
    if (!byId.has(p.provider_id)) byId.set(p.provider_id, p);
  }
  return [...byId.values()]
    .sort((a, b) => priorityOf(a, region) - priorityOf(b, region))
    .map(p => p.provider_name);
}

// Where to Watch for a not-yet-owned preview item — same TMDB lookup as
// movie:checkWatchProviders but no DB row to write to or broadcast.
async function previewMovieWatchProviders(mediaType, platformId, tmdbKey) {
  if (mediaType !== "Movie" && mediaType !== "TV") return null;
  if (!platformId) return null;
  if (!tmdbKey) return null;
  try {
    let tmdbId = platformId;
    if (/^tt\d+$/.test(tmdbId)) {
      const resolved = await resolveTmdbIdFromImdb(mediaType, tmdbId, tmdbKey);
      if (!resolved) return null;
      tmdbId = resolved;
    }
    return await fetchWatchProviders(mediaType, tmdbId, tmdbKey);
  } catch {
    return null;
  }
}

// Fixed/public reference data — movie and TV have separate genre id spaces.
const TMDB_MOVIE_GENRES = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
  27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance",
  878: "Science Fiction", 10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
};
const TMDB_TV_GENRES = {
  10759: "Action & Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  99: "Documentary", 18: "Drama", 10751: "Family", 10762: "Kids", 9648: "Mystery",
  10763: "News", 10764: "Reality", 10765: "Sci-Fi & Fantasy", 10766: "Soap",
  10767: "Talk", 10768: "War & Politics", 37: "Western",
};

// "More From Creator" — no TMDB person id is cached, only their name, so
// this re-resolves one via a live search and uses the top result as-is
// (can occasionally pick the wrong same-named person). TV's job:"Creator"
// tag is less consistently populated than Movie's "Director", so can be empty.
async function getMovieMoreFromCreator(creatorName, mediaType, tmdbKey) {
  if (!tmdbKey || !creatorName) return [];

  try {
    const searchRes  = await fetch(`https://api.themoviedb.org/3/search/person?api_key=${tmdbKey}&query=${encodeURIComponent(creatorName)}`);
    const searchData = await searchRes.json();
    const person = searchData.results?.[0];
    if (!person) return [];

    const kind = mediaType === "Movie" ? "movie" : "tv";
    const job  = mediaType === "Movie" ? "Director" : "Creator";
    const genreMap = mediaType === "Movie" ? TMDB_MOVIE_GENRES : TMDB_TV_GENRES;
    const creditsRes  = await fetch(`https://api.themoviedb.org/3/person/${person.id}/${kind}_credits?api_key=${tmdbKey}`);
    const creditsData = await creditsRes.json();

    const seen = new Set();
    return (creditsData.crew || [])
      .filter(c => c.job === job && !seen.has(c.id) && seen.add(c.id))
      .map(c => ({
        id:          c.id,
        title:       c.title || c.name,
        year:        (c.release_date || c.first_air_date || "").slice(0, 4) || null,
        poster_path: c.poster_path || null,
        rating:      c.vote_average || null,
        genre:       genreMap[c.genre_ids?.[0]] || null,
      }))
      .sort((a, b) => (b.year || 0) - (a.year || 0));
  } catch {
    return []; // same graceful-empty behavior as any other optional TMDB lookup
  }
}

// "More In This Series" (Movie only — no TMDB collections for TV). No
// stored collection id, so re-resolves via a live name search, top match.
async function getMovieMoreFromSeries(seriesName, tmdbKey) {
  if (!tmdbKey || !seriesName) return [];

  try {
    const searchRes  = await fetch(`https://api.themoviedb.org/3/search/collection?api_key=${tmdbKey}&query=${encodeURIComponent(seriesName)}`);
    const searchData = await searchRes.json();
    const collection = searchData.results?.[0];
    if (!collection) return [];

    const collRes  = await fetch(`https://api.themoviedb.org/3/collection/${collection.id}?api_key=${tmdbKey}`);
    const collData = await collRes.json();

    return (collData.parts || [])
      .map(p => ({
        id:          p.id,
        title:       p.title,
        year:        (p.release_date || "").slice(0, 4) || null,
        poster_path: p.poster_path || null,
        rating:      p.vote_average || null,
        genre:       TMDB_MOVIE_GENRES[p.genre_ids?.[0]] || null,
      }))
      // Release order reads more naturally for a series than moreFromCreator's
      // newest-first — Fellowship before Two Towers before Return of the King.
      .sort((a, b) => (a.year || 0) - (b.year || 0));
  } catch {
    return [];
  }
}

// "Similar To" — TMDB's own recommendations feed. No name-search step
// needed; the platform_id resolves directly (via resolveTmdbIdFromImdb
// for OMDB-sourced items).
async function getMovieSimilarTitles(platformId, mediaType, tmdbKey) {
  if (!tmdbKey || !platformId) return [];

  try {
    let tmdbId = platformId;
    if (/^tt\d+$/.test(platformId)) {
      const resolved = await resolveTmdbIdFromImdb(mediaType, platformId, tmdbKey);
      if (!resolved) return [];
      tmdbId = resolved;
    }

    const kind = mediaType === "Movie" ? "movie" : "tv";
    const genreMap = mediaType === "Movie" ? TMDB_MOVIE_GENRES : TMDB_TV_GENRES;
    const res  = await fetch(`https://api.themoviedb.org/3/${kind}/${tmdbId}/recommendations?api_key=${tmdbKey}`);
    const data = await res.json();

    return (data.results || [])
      .map(r => ({
        id:          r.id,
        title:       r.title || r.name,
        year:        (r.release_date || r.first_air_date || "").slice(0, 4) || null,
        poster_path: r.poster_path || null,
        rating:      r.vote_average || null,
        genre:       genreMap[r.genre_ids?.[0]] || null,
      }))
      .filter(w => w.title)
      .slice(0, 20);
  } catch {
    return [];
  }
}

// Title text alone isn't reliable — TMDB can rename a title after it was
// added (found live). Matches by stable TMDB id when available, title as
// fallback for OMDB-sourced/manual items.
function buildLibraryExclusionSets(items) {
  const filmTv = items.filter(i => i.media_type === "Movie" || i.media_type === "TV");
  const titles = new Set(filmTv.map(i => (i.title || "").toLowerCase()));
  const tmdbIds = new Set(
    filmTv
      .filter(i => i.platform_id && /^\d+$/.test(i.platform_id))
      .map(i => `${i.media_type === "Movie" ? "movie" : "tv"}-${i.platform_id}`)
  );
  return { titles, tmdbIds };
}

// "Not interested" dismissals — merged into the same key space as
// buildLibraryExclusionSets so each call site is one Set.has().
function buildDismissedTmdbIds(dismissals) {
  return new Set(
    dismissals.map(d => `${d.media_type === "Movie" ? "movie" : "tv"}-${d.tmdb_id}`)
  );
}

// "Recommended For You" — aggregates recommendations across every title the
// user rated positively (up to SEED_CAP per type, highest-rated first), each
// weighted by how much they liked it. A title several favourites recommend
// ranks higher than one only a lukewarm seed shares — a stronger taste
// signal than any single title's algorithm neighborhood.
async function getMovieRecommendations(items, dismissals, tmdbKey) {
  if (!tmdbKey) return { movie: { items: [], reason: "no_key" }, tv: { items: [], reason: "no_key" } };

  const { titles: inLibraryTitles, tmdbIds: inLibraryTmdbIds } = buildLibraryExclusionSets(items);
  const dismissedTmdbIds = buildDismissedTmdbIds(dismissals);
  // Stored rating is display+11 (see packages/core/tokens/ratings.js) — 11
  // is neutral, so >11 means genuinely liked. Asking TMDB for "more like
  // this" off something you rated negatively (or shrugged at) would seed
  // recommendations from the wrong signal entirely, not just a weaker one.
  const likedFilmTv = items.filter(i =>
    (i.media_type === "Movie" || i.media_type === "TV") && i.platform_id && i.rating != null && i.rating > 11
  );
  // Up from a top-10-per-type cap: with a large, well-rated library that
  // excluded most of what you actually liked from ever seeding a
  // recommendation. 40 keeps each run to a bounded, still-fast number of
  // parallel TMDB calls rather than truly unbounded.
  const SEED_CAP = 40;
  const filmSeeds = likedFilmTv.filter(i => i.media_type === "Movie").sort((a, b) => b.rating - a.rating).slice(0, SEED_CAP);
  const tvSeeds    = likedFilmTv.filter(i => i.media_type === "TV").sort((a, b) => b.rating - a.rating).slice(0, SEED_CAP);
  const seeds = [...filmSeeds, ...tvSeeds];

  if (!seeds.length) return { movie: { items: [], reason: "no_seeds" }, tv: { items: [], reason: "no_seeds" } };

  const scored = new Map(); // `${kind}-${tmdbId}` -> work, with a running weighted score
  await Promise.all(seeds.map(async (seed) => {
    try {
      let tmdbId = seed.platform_id;
      if (/^tt\d+$/.test(tmdbId)) {
        const resolved = await resolveTmdbIdFromImdb(seed.media_type, tmdbId, tmdbKey);
        if (!resolved) return;
        tmdbId = resolved;
      }
      const kind = seed.media_type === "Movie" ? "movie" : "tv";
      const genreMap = seed.media_type === "Movie" ? TMDB_MOVIE_GENRES : TMDB_TV_GENRES;
      const res  = await fetch(`https://api.themoviedb.org/3/${kind}/${tmdbId}/recommendations?api_key=${tmdbKey}`);
      const data = await res.json();

      // Weight by how much you liked the seed (1-10, since ratings here are
      // already filtered to >11/neutral) rather than counting every seed
      // equally — a title several 9s and 10s recommend should outrank one a
      // pile of barely-liked 6s happen to share, and this is what makes a
      // bigger seed pool an improvement instead of just diluting noise.
      const weight = seed.rating - 11;
      for (const r of (data.results || []).slice(0, 15)) {
        const title = r.title || r.name;
        const key = `${kind}-${r.id}`;
        if (!title || inLibraryTitles.has(title.toLowerCase()) || inLibraryTmdbIds.has(key) || dismissedTmdbIds.has(key)) continue;
        const existing = scored.get(key);
        if (existing) {
          existing.score += weight;
          // Attribute "Because you liked X" to whichever seed actually
          // contributed the most weight, not just whichever happened to be
          // processed first (Promise.all resolves in no particular order).
          if (weight > existing.topWeight) { existing.topWeight = weight; existing.because = seed.title; }
          continue;
        }
        scored.set(key, {
          id: r.id,
          mediaType: seed.media_type,
          title,
          year: (r.release_date || r.first_air_date || "").slice(0, 4) || null,
          poster_path: r.poster_path || null,
          rating: r.vote_average || null,
          genre: genreMap[r.genre_ids?.[0]] || null,
          because: seed.title,
          score: weight,
          topWeight: weight,
        });
      }
    } catch { /* this seed failed — others may still succeed */ }
  }));

  // DiscoverView's "Show More" reveals the rest of this same pool — no
  // extra call. Raised alongside the seed cap: a pool built from up to 80
  // seeds (40 film + 40 TV) genuinely has more good candidates in it than
  // one built from 20 did.
  const ranked = [...scored.values()]
    .sort((a, b) => b.score - a.score || (b.rating || 0) - (a.rating || 0));
  return {
    movie: { items: ranked.filter(w => w.mediaType === "Movie").slice(0, 100), reason: filmSeeds.length ? null : "no_seeds" },
    tv:   { items: ranked.filter(w => w.mediaType === "TV").slice(0, 100),   reason: tvSeeds.length   ? null : "no_seeds" },
  };
}

// "Trending This Week" — TMDB's own multi-type feed, not personalized.
// Same exclusion sets as getMovieRecommendations.
async function getMovieTrending(items, dismissals, tmdbKey) {
  if (!tmdbKey) return { movie: { items: [], reason: "no_key" }, tv: { items: [], reason: "no_key" } };

  const { titles: inLibraryTitles, tmdbIds: inLibraryTmdbIds } = buildLibraryExclusionSets(items);
  const dismissedTmdbIds = buildDismissedTmdbIds(dismissals);

  try {
    // Three pages (~20 results/page) — DiscoverView's "Show More" reveals
    // the rest, no extra call needed.
    const [res1, res2, res3] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/trending/all/week?api_key=${tmdbKey}&page=1`),
      fetch(`https://api.themoviedb.org/3/trending/all/week?api_key=${tmdbKey}&page=2`),
      fetch(`https://api.themoviedb.org/3/trending/all/week?api_key=${tmdbKey}&page=3`),
    ]);
    const [data1, data2, data3] = await Promise.all([res1.json(), res2.json(), res3.json()]);
    // Pages aren't guaranteed disjoint (the list can shift mid-request) —
    // dedupe by id+type or an item could render as two identical tiles.
    const seenIds = new Set();
    const merged = [...(data1.results || []), ...(data2.results || []), ...(data3.results || [])].filter(r => {
      const key = `${r.media_type}-${r.id}`;
      if (seenIds.has(key)) return false;
      seenIds.add(key);
      return true;
    });
    const data = { results: merged };

    const trending = (data.results || [])
      .filter(r => r.media_type === "movie" || r.media_type === "tv")
      .map(r => {
        const mediaType = r.media_type === "movie" ? "Movie" : "TV";
        const genreMap  = mediaType === "Movie" ? TMDB_MOVIE_GENRES : TMDB_TV_GENRES;
        return {
          id: r.id,
          mediaType,
          title: r.title || r.name,
          year: (r.release_date || r.first_air_date || "").slice(0, 4) || null,
          poster_path: r.poster_path || null,
          rating: r.vote_average || null,
          genre: genreMap[r.genre_ids?.[0]] || null,
        };
      })
      .filter(w => {
        if (!w.title) return false;
        const key = `${w.mediaType === "Movie" ? "movie" : "tv"}-${w.id}`;
        return !inLibraryTitles.has(w.title.toLowerCase()) && !inLibraryTmdbIds.has(key) && !dismissedTmdbIds.has(key);
      });
    return {
      movie: { items: trending.filter(w => w.mediaType === "Movie"), reason: null },
      tv:   { items: trending.filter(w => w.mediaType === "TV"),   reason: null },
    };
  } catch {
    return { movie: { items: [], reason: null }, tv: { items: [], reason: null } };
  }
}

return {
  fetchMovieCoverArt,
  searchMovieTv,
  fetchTmdbMovieDetails,
  resolveTmdbIdFromImdb,
  enrichMovieItem,
  getWatchRegionOptions,
  fetchWatchProviders,
  getMovieProviderOptions,
  previewMovieWatchProviders,
  getMovieMoreFromCreator,
  getMovieMoreFromSeries,
  getMovieSimilarTitles,
  buildLibraryExclusionSets,
  buildDismissedTmdbIds,
  getMovieRecommendations,
  getMovieTrending,
};

}; // end createMovieService
