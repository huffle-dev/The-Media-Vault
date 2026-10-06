// The portable createXService(storage) instances, shared by
// AddItemScreen.js (search & preview), the library/history tiles and the
// item profile (cover art for already-owned items) — one instance each,
// backed by the real Expo-filesystem storage (coverArtStorage.js), rather
// than each screen creating its own.
import createMovieService from "@media-vault/core/movie";
import createOpenLibraryService from "@media-vault/core/openLibrary";
import createPodcastService from "@media-vault/core/podcast";
import createDiscogsService from "@media-vault/core/discogs";
import createYoutubeService from "@media-vault/core/youtube";
import createSteamService from "@media-vault/core/steam";
import createIgdbService from "@media-vault/core/igdb";
import createAudibleService from "@media-vault/core/audible";
import createCoverArtLookup from "@media-vault/core/coverArtLookup";
import { mobileCoverArtStorage, cacheCoverArtFromUrl, peekCachedCoverArtUri, verifyCachedCover } from "./coverArtStorage";
import { makeLane } from "./lane";
import { fetchWebsiteInfo } from "./websiteInfo";
import { bggSearch, bggDetails } from "./bgg";
import { diag } from "./diag";

// When the phone has no connection every cover fails the same way; say so once a minute instead of per cover.
const OFFLINE = /Unable to resolve host|UnknownHost|Network request failed|network error|timed out|Failed to connect/i;
let lastOfflineNote = 0;
let lastOfflineAt = 0;
export function noteIfOffline(message) {
  if (!OFFLINE.test(String(message || ""))) return false;
  const now = Date.now();
  lastOfflineAt = now;
  if (now - lastOfflineNote > 60000) {
    lastOfflineNote = now;
    diag.add("warn", "network", "The phone could not reach the internet (covers could not be downloaded). Covers will be retried later.");
  }
  return true;
}
export function recentlyOffline() { return Date.now() - lastOfflineAt < 120000; }

export const movie = createMovieService(mobileCoverArtStorage);
export const openLibrary = createOpenLibraryService(mobileCoverArtStorage);
export const podcast = createPodcastService(mobileCoverArtStorage);
export const discogs = createDiscogsService(mobileCoverArtStorage);
export const youtube = createYoutubeService(mobileCoverArtStorage);
export const steam = createSteamService(mobileCoverArtStorage);
export const igdb = createIgdbService(mobileCoverArtStorage);
export const audible = createAudibleService(mobileCoverArtStorage);

const lookupCoverArt = createCoverArtLookup({ movie, openLibrary, podcast, discogs, youtube, steam, igdb, audible });

// What a refresh needs (see refreshItem.js): the services, plus a cover lookup that uses
// the person's keys. Returns a local file path, or null.
export const refreshServicesFor = (keys) => ({
  movie, discogs, podcast, igdb, openLibrary, youtube, websiteInfo: fetchWebsiteInfo, bggSearch, bggDetails,
  coverFor: (item) => lookupCoverArt(item, keys),
});

// A grid mounts dozens of tiles at once, so fetching is metered through two
// lanes: image downloads (a CDN — plenty of headroom, 8 at a time) and API
// lookups (TMDB, Steam and Audible rate-limit, so 4). Each lane serves the
// NEWEST request first — the tiles on screen right now, not the ones already
// scrolled past — and skips a request whose tile has since unmounted. (It
// used to be first-in-first-out, so scrolling fast left the visible tiles
// blank until every tile you'd scrolled past had finished.)
const downloadLane = makeLane(8);
const lookupLane = makeLane(4);

// Best-effort: returns a local file:// cover art path for an already-owned
// item — from its synced cover_art_url if it has one (desktop, or an earlier
// Search & Add, already found the image: no API lookup, no key, and it works
// for types this phone can't search itself, e.g. Board Game), otherwise by
// looking it up through the matching source (packages/core/coverArtLookup.js).
// `keys` is useApiKeys()'s resolved object. Resolves to a path, to null (no art
// available — never throws), or to undefined if `isCancelled()` turned true
// before it got a turn (the caller should just ignore that).
export async function getCoverArtForItem(item, keys, isCancelled) {
  if (item.cover_art_url) {
    // Already on disk from a previous pass — resolve instantly rather than
    // taking a downloadLane slot just to immediately find there's nothing
    // to fetch. A full-library scroll re-requests every visible tile's
    // cover on each pass, and most of those are cache hits.
    const cached = peekCachedCoverArtUri(item.cover_art_url);
    if (cached) return cached;
    const path = await downloadLane(() => cacheCoverArtFromUrl(item.cover_art_url).catch((e) => {
      if (!noteIfOffline(e && e.message)) diag.add("warn", "cover", `Cover download failed for ${item.title || "an item"} (${item.media_type}): ${e && e.message}`, item.cover_art_url);
      return null;
    }), isCancelled);
    if (path !== null) return path; // a path, or undefined when cancelled
  }
  return lookupLane(() => lookupCoverArt(item, keys), isCancelled);
}

// Downloads every synced cover to this phone, for offline use and so no tile
// ever waits on a download. `onProgress({ done, total })` fires as it goes.
export async function cacheAllCoverArt(items, onProgress, { verify = false } = {}) {
  const todo = items.filter((i) => i.cover_art_url);
  let done = 0;
  let failed = 0;
  onProgress({ done, total: todo.length });
  await Promise.all(todo.map((i) => downloadLane(async () => {
    try {
      if (verify) await verifyCachedCover(i.cover_art_url);
      await cacheCoverArtFromUrl(i.cover_art_url);
    } catch (e) {
      failed++;
      noteIfOffline(e && e.message);
    }
    done++;
    if (done % 10 === 0 || done === todo.length) onProgress({ done, total: todo.length });
  })));
  return { total: todo.length, failed };
}
