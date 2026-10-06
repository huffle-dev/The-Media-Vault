// Re-fetching an item's details and cover from its source (desktop's "Force Resync"),
// plus the cover and Movie/TV "fill in what's missing" batches. Pure — the services and
// the Supabase client are passed in — so test/mobileRefreshItem.test.js runs without Expo.
import { applyFetchedPatch } from "@media-vault/core/tokens/itemHelpers.js";

// Per-type lookup, the same functions desktop's Force Resync calls. `svc` = { movie,
// discogs, podcast, igdb, openLibrary, youtube, coverFor(item) -> local path | null }.
// A type with no live source (or a genuine no-match for Game/Book) falls back to the
// cover alone, exactly like desktop.
export async function fetchRefreshDetails(item, keys, svc) {
  const mt = item.media_type;
  const coverOnly = async () => ({ cover_art_path: await svc.coverFor(item) });
  if (mt === "Movie" || mt === "TV") return svc.movie.enrichMovieItem(item, keys.tmdb);
  if (mt === "Music") return svc.discogs.enrichMusicItem(item, keys.discogs);
  if (mt === "Podcast") return svc.podcast.enrichPodcastItem(item);
  if (mt === "Board Game") {
    // The BoardGameGeek id if we have it, else the first search match for the title (desktop's rule).
    let id = item.platform_id || null;
    if (!id) {
      const found = await svc.bggSearch(item.title);
      if (!found.length) throw new Error("No board game found on BGG.");
      id = found[0].platformId;
    }
    return svc.bggDetails(id, mt);
  }
  if (mt === "Website") {
    if (!item.url) throw new Error("No web address saved for this item.");
    return svc.websiteInfo(item.url);
  }
  if (mt === "Web Video" && item.platform_id) {
    if (!keys.youtube) throw new Error("Needs your YouTube key — unlock it in Settings → API keys & sync.");
    return svc.youtube.getYoutubeDetails(String(item.platform_id), keys.youtube);
  }
  if (mt === "Game") {
    if (keys.igdbId && keys.igdbSecret) {
      try { return await svc.igdb.enrichGameItemViaIgdb(item, keys.igdbId, keys.igdbSecret); } catch { /* no match: cover only */ }
    }
    return coverOnly();
  }
  if (mt === "Book" || mt === "Audiobook") {
    try { return await svc.openLibrary.enrichBookItem(item); } catch { /* no match: cover only */ }
    return coverOnly();
  }
  return coverOnly();
}

// The columns to write from fetched details: only real synced columns, a blank fetched
// value never clears an existing one, and the downloaded cover becomes a cover LINK
// (the phone's file is its own; the link is what syncs). `overwrite` = replace values
// that are already filled (Force Resync) vs only fill blanks (the batch fill-ins).
export function buildRefreshPatch(item, details, { allowed, sourceUrlFor, overwrite = true }) {
  const allow = new Set([...allowed, "platform_id"]);
  const raw = applyFetchedPatch(details || {}, item, { overwrite });
  const patch = {};
  for (const [k, v] of Object.entries(raw)) if (allow.has(k)) patch[k] = v;
  // BoardGameGeek's picture (kept under a private name by its reader) is a link too.
  if (!raw.cover_art_url && details && details._thumbnailUrl && (overwrite || !item.cover_art_url)) patch.cover_art_url = details._thumbnailUrl;
  // A page's own picture arrives already as a link.
  if (raw.cover_art_url && (overwrite || !item.cover_art_url)) patch.cover_art_url = raw.cover_art_url;
  if (raw.cover_art_path) {
    const url = sourceUrlFor(raw.cover_art_path);
    if (url && (overwrite || !item.cover_art_url)) patch.cover_art_url = url;
  }
  return patch;
}

// Writes a patch to one item and returns { undo } that puts back what it replaced.
export async function saveRefresh(client, item, patch) {
  const before = {};
  for (const k of Object.keys(patch)) before[k] = item[k] ?? null;
  const { error } = await client.from("items").update({ ...patch, updated_at: new Date().toISOString() }).eq("sync_id", item.sync_id);
  if (error) throw new Error(error.message);
  return {
    undo: async () => {
      const { error: e } = await client.from("items").update({ ...before, updated_at: new Date().toISOString() }).eq("sync_id", item.sync_id);
      if (e) throw e;
    },
  };
}

// ── batches ─────────────────────────────────────────────────────────────────
const blank = (v) => v === null || v === undefined || v === "";

// Movie/TV with something worth filling in, and not already tried today.
export function needsMovieInfo(item, today) {
  if (item.media_type !== "Movie" && item.media_type !== "TV") return false;
  if (item.metadata_checked_date && item.metadata_checked_date === today) return false;
  return ["year", "genre", "creator", "runtime", "content_rating", "cover_art_url"].some((k) => blank(item[k]));
}

export const needsCover = (item) => blank(item.cover_art_url);

// Web Video items that are a channel (not a single video or a playlist).
export const isChannel = (item) => item.media_type === "Web Video" && !!item.platform_id
  && !/^(video|playlist)-/.test(String(item.platform_id));

// Runs `worker` over `list` with at most `limit` in flight, reporting progress; one
// failure never stops the rest. Resolves { done, failed } (failed = items that threw).
export async function runBatch(list, worker, { limit = 3, onProgress = () => {}, isCancelled = () => false } = {}) {
  let next = 0, done = 0, failed = 0;
  onProgress({ done, total: list.length });
  const lane = async () => {
    while (next < list.length && !isCancelled()) {
      const item = list[next++];
      try { await worker(item); } catch { failed++; }
      done++;
      onProgress({ done, total: list.length });
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, lane));
  return { done, failed };
}
