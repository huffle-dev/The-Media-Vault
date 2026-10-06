// CSV export/import shape: the field list and cell-escaping rule. Pure, no
// filesystem access — split out from lib/csv.js (whose buildExportCsv also
// checks cover art files on disk, a desktop-only concern) so the shape of a
// Vault CSV is available to any future platform-agnostic use.

// Every field the CSV importer (db.importItems, and ImportModal's manual
// mapping UI) can actually round-trip. Deliberately excludes: local_path
// and custom_type_id (both point into this machine's own install — a raw
// folder path and a custom_types row id that only means something in the
// database that created it, same as local_path), install_path (ditto, an
// exe path), the cached watch_* / metadata_fetched fields (re-derivable at
// runtime, meaningless once stale), and created_at/updated_at (bookkeeping,
// not user data). owned_platform and condition ARE user-entered, not
// re-derivable from any source, so they belong here despite being easy to
// mistake for the cached fields around them.
const EXPORT_HEADERS = [
  "title", "media_type", "status", "is_local", "rating",
  "date_consumed", "date_added", "cover_art_path",
  "creator", "genre", "year",
  "network", "season_count", "narrator", "platform", "label", "notes",
  "runtime", "imdb_url", "video_quality", "series_name", "series_order",
  "platform_id", "steam_url",
  "player_count", "play_time", "complexity", "bgg_url",
  "country", "language", "cast_list", "critic_rating", "content_rating", "trailer_url",
  "writer", "composer", "studio", "budget", "box_office",
  "publisher", "themes", "game_modes", "player_perspective", "game_engine", "owned_platform",
  "tags", "edition_format", "abridged", "style", "album_type", "copyright", "tracklist",
  "artist", "mechanics", "min_age", "condition", "personal_notes",
  "set_name", "collector_number", "rarity", "type_line", "power_toughness", "format_legality",
  "chapter_count", "total_volumes", "subscribers", "video_count",
  "system", "recommended_level", "site_name", "url", "episode_count",
  "lists",
];

function csvEscape(val) {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

module.exports = { EXPORT_HEADERS, csvEscape };
