// Saves a new item to the user's library (a Supabase insert — Cloud Sync
// carries it to desktop). Shared by Search & Add and Discover's "Add to
// Watchlist", so the two can't disagree on which fields get saved.
import { supabase } from "./supabase";
import { getCoverArtSourceUrl } from "./coverArtStorage";

// Every column any of the services' detail-fetch functions might return
// that's actually a real, synced column on the items table
// (supabase/schema_v2_cloud_sync.sql) — cover_art_path is deliberately
// excluded even though some of those functions return it, since it's
// never synced (each device keeps its own local file); the image's source
// URL is saved as cover_art_url instead.
export const SYNCED_DETAIL_FIELDS = [
  "creator", "genre", "year", "notes", "network", "season_count", "narrator",
  "runtime", "imdb_url", "series_name", "country", "language", "cast_list",
  "critic_rating", "content_rating", "trailer_url", "tmdb_rating", "tmdb_votes",
  "publisher", "tags", "ebook_url", "openlibrary_rating", "openlibrary_ratings_count",
  "set_name", "collector_number", "rarity", "type_line", "power_toughness",
  "format_legality", "mana_cost", "artist", "episode_count", "podcast_url", "copyright",
  "label", "style", "album_type", "tracklist", "discogs_rating", "discogs_ratings_count", "discogs_url",
  "subscribers", "video_count", "url", "site_name", "platform", "steam_url", "metacritic_rating", "igdb_url", "igdb_rating",
  "series_order", "igdb_rating_count", "themes", "game_modes", "player_perspective", "game_engine", "metadata_checked_date",
];

export function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// `details` is a full fetchDetails() result (richer item), `quickRow` the
// bare fields parsed off a search result when no details were fetched.
// Throws on failure.
export async function addItemToLibrary({ mediaType, title, platformId, details, quickRow }) {
  const { data: auth } = await supabase.auth.getUser();
  const row = details
    ? Object.fromEntries(SYNCED_DETAIL_FIELDS.filter((k) => details[k] != null).map((k) => [k, details[k]]))
    : (quickRow || {});
  const syncId = uuidv4();
  const { error } = await supabase.from("items").insert({
    sync_id: syncId,
    user_id: auth.user.id,
    title: (details || row).title || title,
    media_type: mediaType,
    status: "wishlist",
    platform_id: (details && details.platform_id) || platformId,
    updated_at: new Date().toISOString(),
    // Where the fetched cover art came from, so this phone's tile grid and
    // other devices can download straight from the link.
    cover_art_url: details?.cover_art_path ? getCoverArtSourceUrl(details.cover_art_path) : (details?._thumbnailUrl ?? null),
    ...row,
  });
  if (error) throw error;
  return syncId;
}
