// Apple/iTunes Search podcast integration.
//
// Exported as a factory (createPodcastService(storage)) for the same
// reason packages/core/movie.js is — see that file's header comment.
// fetchApplePodcastDetails/enrichPodcastItem write a cover art file to
// disk; searchPodcasts, fetchPodcastRssInfo, getPodcastMoreFromHost, and
// getPodcastSimilarByGenre are pure and never touch storage.
const { BROWSER_HEADERS } = require("@media-vault/core/httpHeaders");
const { stripHtml, decodeHtmlEntities } = require("@media-vault/core/htmlText");
const { fetchWithTimeout: fetch } = require("@media-vault/core/fetchWithTimeout");

module.exports = function createPodcastService(storage) {

// A podcast's RSS feed carries Description/Copyright/Language data the
// Lookup API doesn't expose, plus per-episode <itunes:duration>, averaged
// into "Avg Episode Length". No XML parser dependency — bounded regexes,
// matched against the substring before the first <item> to avoid colliding
// with episode-level <description> tags.
async function fetchPodcastRssInfo(feedUrl) {
  if (!feedUrl) return {};
  try {
    const res = await fetch(feedUrl, { headers: BROWSER_HEADERS });
    if (!res.ok) return {};
    const xml = await res.text();
    const channelXml = xml.split(/<item[\s>]/i)[0];

    const stripCdata = (s) => s.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "");
    const descMatch = channelXml.match(/<description>([\s\S]*?)<\/description>/i);
    const notes = descMatch ? stripHtml(stripCdata(descMatch[1])) : null;
    const copyrightMatch = channelXml.match(/<copyright>([\s\S]*?)<\/copyright>/i);
    const copyright = copyrightMatch ? decodeHtmlEntities(stripCdata(copyrightMatch[1]).trim()) : null;
    const langMatch = channelXml.match(/<language>([\s\S]*?)<\/language>/i);
    const language = langMatch ? langMatch[1].trim() : null;

    // itunes:duration is "HH:MM:SS"/"MM:SS" or a bare seconds count.
    // Averaged across every episode the feed returns (usually the full
    // back-catalog, since these feeds rarely paginate).
    const durations = Array.from(xml.matchAll(/<itunes:duration>([^<]*)<\/itunes:duration>/gi), m => m[1].trim());
    let totalSeconds = 0, count = 0;
    for (const d of durations) {
      let seconds = null;
      const hms = /^(\d+):(\d{2}):(\d{2})$/.exec(d);
      const ms = /^(\d+):(\d{2})$/.exec(d);
      if (hms) seconds = Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]);
      else if (ms) seconds = Number(ms[1]) * 60 + Number(ms[2]);
      else if (/^\d+$/.test(d)) seconds = Number(d);
      if (seconds != null) { totalSeconds += seconds; count++; }
    }
    const runtime = count ? Math.round(totalSeconds / count / 60) : null;

    return { notes, copyright, language, runtime };
  } catch {
    return {};
  }
}

// Shared by search:details (Podcast) and podcast:lookupDetails — fetches one
// show's full detail via Apple's Lookup API, then layers on the RSS-only
// fields (see fetchPodcastRssInfo) and downloads cover art.
async function fetchApplePodcastDetails(collectionId) {
  const res = await fetch(`https://itunes.apple.com/lookup?id=${collectionId}`);
  if (!res.ok) throw new Error("Podcast lookup failed.");
  const data = await res.json();
  const p = data.results?.[0];
  if (!p) throw new Error("Podcast not found.");

  // The whole block is inside the try, not just the download/fileExists
  // calls — storage.joinPath/coverArtDir() themselves can throw (mobile's
  // storage is a Proxy that throws on every property access, since it
  // never fetches cover art at all), and a bug here previously let that
  // escape uncaught, failing the *entire* details fetch over a best-effort
  // art step.
  let cover_art_path = null;
  const artworkUrl = p.artworkUrl600 || p.artworkUrl100;
  if (artworkUrl) {
    try {
      const destPath = storage.joinPath(storage.coverArtDir(), `itunes-podcast-${p.collectionId}.jpg`);
      await storage.ensureImage(artworkUrl, destPath);
      cover_art_path = destPath;
    } catch { /* falls back to no art */ }
  }

  const rss = await fetchPodcastRssInfo(p.feedUrl);

  return {
    title:          p.collectionName,
    media_type:     "Podcast",
    platform_id:    String(p.collectionId),
    creator:        p.artistName || null,
    genre:          p.primaryGenreName || null,
    episode_count:  p.trackCount || null,
    // releaseDate tends to track recent episode activity, not day one — best-effort.
    year:           p.releaseDate ? parseInt(p.releaseDate.slice(0, 4), 10) : null,
    podcast_url:    p.collectionViewUrl || p.trackViewUrl || null,
    cover_art_path,
    notes:          rss.notes,
    copyright:      rss.copyright,
    language:       rss.language,
    runtime:        rss.runtime,
  };
}

// "More From Host" — iTunes has no artist-id lookup, just text search, so
// results are filtered to an exact (case-insensitive) artistName match.
async function getPodcastMoreFromHost(host, excludePlatformId) {
  if (!host) return [];
  try {
    const res = await fetch(`https://itunes.apple.com/search?media=podcast&limit=24&term=${encodeURIComponent(host)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || [])
      .filter(p => p.artistName && p.artistName.toLowerCase() === host.toLowerCase() && String(p.collectionId) !== String(excludePlatformId))
      .map(p => ({
        id: p.collectionId,
        mediaType: "Podcast",
        title: p.collectionName,
        year: p.releaseDate ? parseInt(p.releaseDate.slice(0, 4), 10) : null,
        coverUrl: p.artworkUrl600 || p.artworkUrl100 || null,
        genre: p.primaryGenreName || null,
      }))
      .slice(0, 12);
  } catch {
    return [];
  }
}

// "Similar To" — no recommendation endpoint, so reuses the genre-search
// fallback pattern (real results, not a true similarity signal).
async function getPodcastSimilarByGenre(genre, excludePlatformId) {
  if (!genre) return [];
  try {
    const res = await fetch(`https://itunes.apple.com/search?media=podcast&limit=24&term=${encodeURIComponent(genre)}&attribute=genreIndex`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || [])
      .filter(p => p.collectionId && String(p.collectionId) !== String(excludePlatformId))
      .map(p => ({
        id: p.collectionId,
        mediaType: "Podcast",
        title: p.collectionName,
        year: p.releaseDate ? parseInt(p.releaseDate.slice(0, 4), 10) : null,
        coverUrl: p.artworkUrl600 || p.artworkUrl100 || null,
        genre: p.primaryGenreName || null,
      }))
      .slice(0, 12);
  } catch {
    return [];
  }
}

// Podcast — Apple's iTunes Search API, free/keyless (still works for
// podcasts even though the equivalent movie search went dead — see
// BACKLOG.md "iTunes movie search is dead").
async function searchPodcasts(query) {
  const url = `https://itunes.apple.com/search?media=podcast&limit=24&term=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Podcast search failed.");
  const data = await res.json();
  return (data.results || []).map(p => ({
    platformId:  String(p.collectionId),
    title:       p.collectionName,
    type:        "podcast",
    storeUrl:    p.collectionViewUrl,
    storeLabel:  "Apple Podcasts ↗",
    thumbnailUrl: p.artworkUrl100 || null,
  }));
}

// Same title-search fallback as enrichMusicItem — lets Fetch Info work on
// a manually-typed item too.
async function enrichPodcastItem(item) {
  let collectionId = item.platform_id || null;
  if (!collectionId) {
    if (!item.title) throw new Error("No title to search with.");
    const res = await fetch(`https://itunes.apple.com/search?media=podcast&limit=1&term=${encodeURIComponent(item.title)}`);
    if (!res.ok) throw new Error("Podcast search failed.");
    const data = await res.json();
    const match = data.results && data.results[0];
    if (!match) throw new Error("No match found on Apple Podcasts.");
    collectionId = match.collectionId;
  }
  return await fetchApplePodcastDetails(collectionId);
}

return {
  fetchPodcastRssInfo,
  fetchApplePodcastDetails,
  searchPodcasts,
  getPodcastMoreFromHost,
  getPodcastSimilarByGenre,
  enrichPodcastItem,
};

}; // end createPodcastService
