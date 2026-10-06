// Item-level helpers that don't fit cleanly under theme/ratings/media-type
// config — IPC error cleanup, cast/tracklist parsing, the Fetch Info merge
// rule, and Game launch/platform resolution. Split out of the old
// monolithic tokens.js.

// Electron wraps every ipcRenderer.invoke rejection in boilerplate like
// "Error invoking remote method 'search:query': Error: <actual message>".
// Strip that down to just the message our own code threw.
export const cleanIpcError = (err) => {
  const msg = err?.message || String(err);
  const idx = msg.lastIndexOf("Error: ");
  return idx !== -1 ? msg.slice(idx + 7) : msg;
};

// Media types whose cover art is naturally square (album covers, podcast
// art, board game box art, audiobook art) rather than the default 2:3
// poster ratio every other type uses.
const SQUARE_ART_TYPES = ["Music", "Podcast", "Board Game", "Audiobook", "Web Video"];
export const isSquareArt = (mediaType) => SQUARE_ART_TYPES.includes(mediaType);

// Art that is naturally 16:9 inside a square frame: a YouTube video's or
// playlist's thumbnail (a channel's avatar is square already). Shown whole
// over a blurred copy of itself instead of cropped to the middle.
// A Web Video item is a YouTube channel, a single video or a playlist, told
// apart by its platform_id: a bare channel id, "video-<id>" or "playlist-<id>"
// (see packages/core/youtube.js). null for any other type.
export const webVideoKind = (item) => {
  if (!item || item.media_type !== "Web Video") return null;
  const pid = String(item.platform_id || "");
  if (pid.startsWith("video-")) return "video";
  if (pid.startsWith("playlist-")) return "playlist";
  return "channel";
};

export const isWideArt = (item) =>
  !!item && item.media_type === "Web Video" && /^(video|playlist)-/.test(String(item.platform_id || ""));

// cast_list holds richer per-actor data (name, character, TMDB profile_path)
// as a JSON string; items enriched before that feature still have the old
// plain "Name, Name, Name" format (and manual edits always save plain text).
// Tolerant of either: valid JSON array wins, else falls back to a comma-split.
export const parseCastList = (raw) => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return raw.split(",").map(name => ({ name: name.trim(), character: null, profile_path: null })).filter(c => c.name);
};

// Shared merge step for every "Fetch Info / Force Refresh / Force Resync"
// button (AddEditModal and ItemProfile alike): given a freshly-fetched
// details object and the item's current field values, decides which fields
// should actually be written.
//
// - `_`-prefixed keys (e.g. bggDetails' `_thumbnailUrl`) are helper values,
//   not real columns, and are always skipped.
// - `undefined` means "not applicable to this type"; `null`/`""` mean "the
//   source had nothing" — either way, a blank fetched value never clears an
//   existing one, in force mode or not.
// - `alwaysFresh` names fields that take the latest value whenever present,
//   bypassing the blank-only gate — purely derived data (ids, cast/
//   tracklist, rating-breakdown numbers) with nothing a user hand-curates
//   to protect.
const isBlankValue = (v) => v === null || v === undefined || v === "";

export const applyFetchedPatch = (details, current, { overwrite = false, alwaysFresh = [] } = {}) => {
  const fresh = new Set(alwaysFresh);
  const patch = {};
  for (const [key, value] of Object.entries(details)) {
    if (key.startsWith("_") || value === undefined) continue;
    if (isBlankValue(value)) continue;
    if (fresh.has(key) || overwrite || isBlankValue(current[key])) patch[key] = value;
  }
  return patch;
};

// tracklist holds each track's position/title/duration as a JSON string,
// same storage pattern as cast_list above — Discogs is the only source that
// populates it today, so the tolerant parse-or-empty shape is just for
// consistency with this file's other list-like fields.
export const parseTracklist = (raw) => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return [];
};

// watch_providers is a JSON blob of { countryCode: { flatrate, rent, buy } }
// covering every country TMDB has data, cached from one API call — this
// pulls out just the bucket for the currently selected country. Shared by
// the TopBar filter and Item Profile's sidebar card, so both read the same
// live-for-region data instead of the item's watch_flatrate/rent/buy
// columns, which only reflect the region selected at the last check.
export const watchProvidersForRegion = (item, region, type) => {
  try {
    return JSON.parse(item.watch_providers || "{}")[region]?.[type] || [];
  } catch {
    return [];
  }
};

// Owned on this computer OR marked owned on another of the user's devices (the
// phone). is_local alone means "on this computer" and is still what the toggle edits.
export const isOwned = (item) => item.is_local === 1 || item.owned_elsewhere === 1;

// TMDB's own region-level watch page for this title — the one genuine
// clickable URL the watch/providers response provides. Not per-provider;
// TMDB's API has no such link. Older cached items can legitimately have none.
export const watchLinkForRegion = (item, region) => {
  try {
    return JSON.parse(item.watch_providers || "{}")[region]?.link || null;
  } catch {
    return null;
  }
};

// Shared by PosterCard's tile-hover Launch button and Item Profile's
// ExternalLinks — decides whether an owned Game can be launched, and
// through which mechanism. Steam's steam:// protocol works for any owned
// game purely off its numeric appid. GOG has no such protocol, so its
// launch only becomes available once services/gog.js's install scan has
// stamped install_path (as did the Epic scan before that integration was
// removed — such items keep their stored path) — enough on its own since
// it funnels through the generic window.vault.game.launch.
// Returns null when neither applies, so callers render nothing with a
// single truthiness check.
export const launchAction = (item) => {
  if (item.media_type !== "Game" || item.is_local !== 1) return null;
  if (item.platform_id && /^\d+$/.test(item.platform_id)) {
    return () => window.vault.steam.launch(item.platform_id);
  }
  if (item.install_path) {
    return () => window.vault.game.launch(item.install_path);
  }
  return null;
};

// Manual platform tag for a Game owned somewhere this app has no sync for
// (PlayStation/Xbox/Nintendo/etc.) — stored in its own `owned_platform`
// column since `platform` already means something else (IGDB's list of
// platforms a game is AVAILABLE on, not which one the user owns it on).
export const OWNED_PLATFORM_OPTIONS = ["PlayStation", "Xbox", "Nintendo", "Other"];

// One "which platform is this Game actually on" answer for the Platform
// filter, preferring a real synced store id (Steam/GOG, plus Epic for games imported before that integration was removed, from
// platform_id's prefix convention) over the manual owned_platform tag.
// Games with neither fall back to "Local" if owned; a wishlist item with
// none of the above returns null.
export const effectivePlatform = (item) => {
  if (item.media_type !== "Game") return null;
  const pid = item.platform_id ? String(item.platform_id) : null;
  if (pid) {
    if (/^\d+$/.test(pid)) return "Steam";
    if (pid.startsWith("gog-")) return "GOG";
    if (pid.startsWith("epic-")) return "Epic";
  }
  if (item.owned_platform) return item.owned_platform;
  if (item.is_local === 1) return "Local";
  return null;
};
