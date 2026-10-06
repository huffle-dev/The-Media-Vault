// Media type configuration — the built-in type list, their per-field forms,
// tab groupings, and custom-type support. Split out of the old monolithic
// tokens.js.

import { T, notifyThemeListeners } from "./theme.js";

export const MEDIA_TYPES = [
  {
    label:    "Movie",
    color:    "#e8b84b",
    icon:     "🎬",
    gradient: "linear-gradient(160deg, #2a1f06 0%, #1a1208 50%, #0f0c05 100%)",
  },
  {
    label:    "TV",
    color:    "#5b8ff5",
    icon:     "📺",
    gradient: "linear-gradient(160deg, #060f2a 0%, #040b1a 50%, #02060f 100%)",
  },
  {
    label:    "Book",
    color:    "#e87a4b",
    icon:     "📖",
    gradient: "linear-gradient(160deg, #2a1206 0%, #1a0e06 50%, #0f0804 100%)",
  },
  {
    label:    "Audiobook",
    color:    "#a78bfa",
    icon:     "🎧",
    gradient: "linear-gradient(160deg, #1a0a2a 0%, #110618 50%, #090410 100%)",
  },
  {
    label:    "Game",
    color:    "#4be8c8",
    icon:     "🎮",
    gradient: "linear-gradient(160deg, #062a24 0%, #041a17 50%, #030f0d 100%)",
  },
  {
    label:    "Music",
    color:    "#f472b6",
    icon:     "🎵",
    gradient: "linear-gradient(160deg, #2a0618 0%, #1a0410 50%, #0f030a 100%)",
  },
  {
    label:    "Board Game",
    color:    "#e84b4b",
    icon:     "🎲",
    gradient: "linear-gradient(160deg, #2a0606 0%, #1a0404 50%, #0f0202 100%)",
  },
  {
    label:    "Web Video",
    color:    "#22d3ee",
    icon:     "📹",
    gradient: "linear-gradient(160deg, #062228 0%, #04161a 50%, #020d0f 100%)",
  },
  {
    label:    "Website",
    color:    "#94a3b8",
    icon:     "🔗",
    gradient: "linear-gradient(160deg, #131820 0%, #0c1015 50%, #06090c 100%)",
  },
  {
    label:    "Podcast",
    color:    "#fda4af",
    icon:     "🎙️",
    gradient: "linear-gradient(160deg, #2a0f14 0%, #1a0a0d 50%, #0f0607 100%)",
  },
];

// Snapshot of each built-in type's original color/icon/gradient, captured
// before any user override can ever be applied — the source of truth for
// "reset to default" and for the Settings picker's default swatch/icon.
export const DEFAULT_TYPE_STYLES = Object.fromEntries(
  MEDIA_TYPES.map(t => [t.label, { color: t.color, icon: t.icon, gradient: t.gradient }])
);

// Type tab groups for the top bar
export const TYPE_TABS = [
  { label: "All",         icon: null,  includes: ["Movie","TV","Book","Audiobook","Game","Music","Board Game","Web Video","Website","Podcast"] },
  { label: "Movies",      icon: "🎬",  includes: ["Movie"],        color: "#e8b84b" },
  { label: "TV",          icon: "📺",  includes: ["TV"],          color: "#5b8ff5" },
  { label: "Books",       icon: "📖",  includes: ["Book"],        color: "#e87a4b" },
  { label: "Games",       icon: "🎮",  includes: ["Game"],        color: "#4be8c8" },
  { label: "Audiobooks",  icon: "🎧",  includes: ["Audiobook"],   color: "#a78bfa" },
  { label: "Music",       icon: "🎵",  includes: ["Music"],       color: "#f472b6" },
  { label: "Board Games", icon: "🎲",  includes: ["Board Game"],  color: "#e84b4b" },
  { label: "Web Videos",  icon: "📹",  includes: ["Web Video"],   color: "#22d3ee" },
  { label: "Websites",    icon: "🔗",  includes: ["Website"],     color: "#94a3b8" },
  { label: "Podcasts",    icon: "🎙️",  includes: ["Podcast"],     color: "#fda4af" },
];

// Per-built-in-type color/icon overrides — mutates MEDIA_TYPES and TYPE_TABS
// in place, same pattern as T's own mutate-in-place approach in theme.js, so
// every reader (getTypeConfig, TopBar, PosterCard, ItemProfile) picks it up
// for free. Reuses theme.js's own themeListeners via notifyThemeListeners,
// so the one App.jsx subscription re-renders on these changes too.
// `overrides` is keyed by the real media_type string (e.g. "Movie"), which is
// both MEDIA_TYPES' `label` and TYPE_TABS' `includes[0]` for a built-in tab.
export const applyTypeStyleOverrides = (overrides) => {
  for (const mt of MEDIA_TYPES) {
    const o = overrides[mt.label];
    if (!o) continue;
    if (o.icon) mt.icon = o.icon;
    if (o.color) {
      mt.color = o.color;
      // Tile background gradient is derived from color, same formula custom
      // types use (getEffectiveTypeConfig below), unless the override
      // explicitly carries its own gradient (the reset flow, restoring the
      // original hand-tuned 3-stop gradient exactly).
      mt.gradient = o.gradient || `linear-gradient(160deg, ${o.color}22 0%, ${T.bg} 75%)`;
    }
  }
  for (const tab of TYPE_TABS) {
    const key = !tab.isCustom && tab.includes && tab.includes.length === 1 ? tab.includes[0] : null;
    const o = key && overrides[key];
    if (!o) continue;
    if (o.color) tab.color = o.color;
    if (o.icon) tab.icon = o.icon;
  }
  notifyThemeListeners();
};

export const resetTypeStyles = () => {
  applyTypeStyleOverrides(
    Object.fromEntries(Object.entries(DEFAULT_TYPE_STYLES).map(([k, v]) => [k, { color: v.color, icon: v.icon, gradient: v.gradient }]))
  );
};

// Type-specific metadata fields
export const TYPE_FIELDS = {
  Movie: [
    { key: "creator",       label: "Director" },
    { key: "writer",        label: "Writer" },
    { key: "composer",      label: "Composer" },
    { key: "studio",        label: "Studio" },
    { key: "genre",         label: "Genre" },
    { key: "year",          label: "Year" },
    { key: "runtime",       label: "Runtime (mins)" },
    { key: "budget",        label: "Budget" },
    { key: "box_office",    label: "Box Office" },
    { key: "country",       label: "Country" },
    { key: "language",      label: "Language" },
    { key: "cast_list",      label: "Cast" },
    { key: "critic_rating",  label: "Critic Rating" },
    { key: "content_rating", label: "Content Rating" },
    { key: "imdb_url",       label: "IMDB URL" },
    { key: "trailer_url",    label: "Trailer URL" },
    { key: "series_name",    label: "Series" },
    { key: "series_order",   label: "Series Order" },
    { key: "tags",           label: "Tags" },
  ],
  TV: [
    { key: "creator",       label: "Creator" },
    { key: "writer",        label: "Writer" },
    { key: "composer",      label: "Composer" },
    { key: "studio",        label: "Studio" },
    { key: "network",       label: "Network / Platform" },
    { key: "genre",         label: "Genre" },
    { key: "year",          label: "Year" },
    { key: "season_count",  label: "Seasons" },
    { key: "runtime",       label: "Avg Episode Runtime (mins)" },
    { key: "country",       label: "Country" },
    { key: "language",      label: "Language" },
    { key: "cast_list",      label: "Cast" },
    { key: "critic_rating",  label: "Critic Rating" },
    { key: "content_rating", label: "Content Rating" },
    { key: "imdb_url",       label: "IMDB URL" },
    { key: "trailer_url",    label: "Trailer URL" },
    { key: "series_name",    label: "Series" },
    { key: "series_order",   label: "Series Order" },
    { key: "tags",           label: "Tags" },
  ],
  Book: [
    { key: "creator",      label: "Author" },
    { key: "publisher",    label: "Publisher" },
    { key: "genre",        label: "Genre" },
    { key: "tags",         label: "Tags" },
    { key: "language",     label: "Language" },
    { key: "year",         label: "Year" },
    { key: "runtime",      label: "Page Count" },
    { key: "series_name",  label: "Series" },
    { key: "series_order", label: "Series Order" },
  ],
  Audiobook: [
    { key: "creator",         label: "Author" },
    { key: "narrator",        label: "Narrator" },
    { key: "publisher",       label: "Publisher" },
    { key: "genre",           label: "Genre" },
    { key: "tags",            label: "Tags" },
    { key: "language",        label: "Language" },
    { key: "edition_format",  label: "Edition Format" },
    { key: "abridged",        label: "Abridged?" },
    { key: "year",            label: "Year" },
    { key: "runtime",         label: "Duration (mins)" },
    { key: "series_name",     label: "Series" },
    { key: "series_order",    label: "Series Order" },
  ],
  Game: [
    { key: "creator",             label: "Developer" },
    { key: "publisher",           label: "Publisher" },
    { key: "platform",            label: "Platform" },
    { key: "owned_platform",      label: "Owned On" },
    { key: "genre",                label: "Genre" },
    { key: "themes",               label: "Themes" },
    { key: "game_modes",           label: "Game Modes" },
    { key: "player_perspective",   label: "Player Perspective" },
    { key: "game_engine",          label: "Game Engine" },
    { key: "year",                 label: "Year" },
    { key: "runtime",              label: "Avg Playtime (hrs)" },
    { key: "series_name",          label: "Series" },
    { key: "series_order",         label: "Series Order" },
    { key: "steam_url",            label: "Steam URL" },
    { key: "tags",                 label: "Tags" },
  ],
  Music: [
    { key: "creator",    label: "Artist" },
    { key: "label",      label: "Label" },
    { key: "genre",      label: "Genre" },
    { key: "style",      label: "Style" },
    { key: "album_type", label: "Album Type" },
    { key: "country",    label: "Country" },
    { key: "year",       label: "Release Date" },
    { key: "runtime",    label: "Total Duration (mins)" },
    { key: "copyright",  label: "Copyright" },
    { key: "condition",  label: "Condition" },
    { key: "tags",       label: "Tags" },
  ],
  "Board Game": [
    { key: "creator",      label: "Designer" },
    { key: "publisher",    label: "Publisher" },
    { key: "artist",       label: "Artist" },
    { key: "genre",        label: "Category" },
    { key: "mechanics",    label: "Mechanics" },
    { key: "year",         label: "Year" },
    { key: "player_count", label: "Player Count" },
    { key: "play_time",    label: "Play Time (mins)" },
    { key: "complexity",   label: "Complexity (1–5)" },
    { key: "min_age",      label: "Min Age" },
    { key: "bgg_url",      label: "BGG URL" },
    { key: "series_name",  label: "Series" },
    { key: "series_order", label: "Series Order" },
    { key: "condition",    label: "Condition" },
    { key: "tags",         label: "Tags" },
  ],
  "Web Video": [
    { key: "creator",     label: "Creator" },
    { key: "platform",    label: "Platform" },
    { key: "genre",       label: "Category" },
    { key: "language",    label: "Language" },
    { key: "subscribers", label: "Subscribers" },
    { key: "video_count", label: "Video Count" },
    { key: "runtime",     label: "Length (min)" },
    { key: "year",        label: "Started / Published" },
    { key: "url",         label: "URL" },
    { key: "tags",        label: "Tags" },
  ],
  Website: [
    { key: "site_name", label: "Site Name" },
    { key: "creator",   label: "Author" },
    { key: "year",       label: "Published" },
    { key: "genre",      label: "Category" },
    { key: "url",        label: "URL" },
    { key: "tags",       label: "Tags" },
  ],
  Podcast: [
    { key: "creator",       label: "Host" },
    { key: "network",       label: "Network" },
    { key: "genre",         label: "Category" },
    { key: "language",      label: "Language" },
    { key: "episode_count", label: "Episode Count" },
    { key: "runtime",       label: "Avg Episode Length (mins)" },
    { key: "year",          label: "Started" },
    { key: "copyright",     label: "Copyright" },
    { key: "tags",          label: "Tags" },
  ],
};

// Helper: get type config by media_type string
export const getTypeConfig = (mediaType) =>
  MEDIA_TYPES.find(t => t.label === mediaType) || MEDIA_TYPES[0];

// ── Custom media types ───────────────────────────────────────────────────
// media_type is the literal string "Custom" for every custom-typed item —
// custom_type_id (a real DB id) distinguishes one custom type from another.
// "custom:<id>" is a synthetic key used only in the UI layer so custom
// types flow through the same TYPE_TABS `includes` mechanism as built-ins.

export const effectiveType = (item) =>
  (item.media_type === "Custom" && item.custom_type_id != null)
    ? `custom:${item.custom_type_id}`
    : item.media_type;

// Same {label,color,icon,gradient} shape as getTypeConfig, for either kind.
// customTypes is the array loaded from window.vault.customTypes.getAll().
export const getEffectiveTypeConfig = (item, customTypes = []) => {
  if (item.media_type === "Custom" && item.custom_type_id != null) {
    const ct = customTypes.find(t => t.id === item.custom_type_id);
    if (ct) {
      return {
        label: ct.label,
        color: ct.color,
        icon: ct.icon,
        gradient: `linear-gradient(160deg, ${ct.color}22 0%, ${T.bg} 75%)`,
      };
    }
  }
  return getTypeConfig(item.media_type);
};

// TYPE_TABS extended with one tab per custom type — same shape, so every
// consumer that already maps over TYPE_TABS (TopBar, filtering) works
// unchanged once it's given this instead of the static list.
export const withCustomTypeTabs = (customTypes = []) => [
  ...TYPE_TABS,
  ...customTypes.map(ct => ({
    label: ct.label,
    icon: ct.icon,
    includes: [`custom:${ct.id}`],
    color: ct.color,
    isCustom: true,
    customTypeId: ct.id,
  })),
];

// Stable per-tab identity for the "hide this type" setting — the same
// media_type string for built-ins, the same custom:<id> synthetic key
// effectiveType() already uses for custom types.
export const typeTabKey = (tab) =>
  tab.isCustom ? `custom:${tab.customTypeId}` : tab.includes[0];

// User-draggable display order for the tab bar — orderKeys is a persisted
// array of typeTabKey() values. Tabs not yet present in it fall in at the
// end, in their existing relative order (Array.prototype.sort is stable).
export const orderTypeTabs = (tabs, orderKeys = []) => {
  const index = new Map(orderKeys.map((k, i) => [k, i]));
  return [...tabs].sort((a, b) => {
    const ia = index.has(typeTabKey(a)) ? index.get(typeTabKey(a)) : Infinity;
    const ib = index.has(typeTabKey(b)) ? index.get(typeTabKey(b)) : Infinity;
    return ia - ib;
  });
};
