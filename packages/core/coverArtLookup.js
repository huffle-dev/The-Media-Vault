// "Find this already-owned item's cover art" — one dispatcher over the
// per-source services, shared by the mobile tile grid (fallback for items
// with no synced cover_art_url) and desktop's link backfill
// (lib/coverArtBackfill.js, which runs it against a storage that records
// each image URL instead of downloading). Factory over the already-built
// services so it never requires anything platform-specific itself (see
// packages/core/movie.js's header comment for why that matters to Metro).
//
// Resolves to whatever the matching service's detail fetch reports as
// cover_art_path (or null — never throws — for a type with no lookup, a
// missing key, or a failed lookup; callers treat null as "no art available").
module.exports = function createCoverArtLookup({ movie, openLibrary, podcast, discogs, youtube, steam, igdb, audible }) {
  return async function getCoverArtForItem(item, keys) {
    if (!item.platform_id) return null;
    try {
      let details = null;
      const pid = String(item.platform_id);
      switch (item.media_type) {
        case "Movie": case "TV": {
          if (!keys.tmdb) return null;
          // Older items carry an IMDb id (tt…) instead of a TMDB one.
          const tmdbId = /^tt\d+$/.test(pid)
            ? await movie.resolveTmdbIdFromImdb(item.media_type, pid, keys.tmdb)
            : pid;
          if (!tmdbId) return null;
          details = await movie.fetchTmdbMovieDetails(item.media_type, tmdbId, keys.tmdb);
          break;
        }
        case "Book":
          details = await openLibrary.enrichBookItem(item);
          break;
        case "Audiobook":
          // Only Audible-sourced audiobooks (audible-<ASIN>) have a lookup
          // here — anything else (older Open Library-sourced rows) gets no art.
          if (!pid.startsWith("audible-")) return null;
          details = await audible.getAudibleBookDetails(pid.slice("audible-".length));
          break;
        case "Podcast":
          details = await podcast.fetchApplePodcastDetails(pid);
          break;
        case "Music":
          details = await discogs.fetchDiscogsReleaseDetails(pid, keys.discogs);
          break;
        case "Web Video":
          if (!keys.youtube) return null;
          details = await youtube.getYoutubeDetails(pid, keys.youtube);
          break;
        case "Game":
          if (/^\d+$/.test(pid)) {
            // Straight to Steam's CDN — no appdetails call, which Steam
            // rate-limits hard (~200 per 5 minutes).
            return await steam.ensureSteamCover(pid);
          }
          if (keys.igdbId && keys.igdbSecret) {
            details = await igdb.enrichGameItemViaIgdb(item, keys.igdbId, keys.igdbSecret);
          }
          break;
        default:
          return null;
      }
      return details?.cover_art_path ?? null;
    } catch {
      return null;
    }
  };
};
