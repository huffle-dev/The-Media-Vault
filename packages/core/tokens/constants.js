// Plain filter/sort/list constants with no logic attached. Split out of the
// old monolithic tokens.js.

export const GENRES = [
  "All Genres","Action","Animation","Comedy","Documentary",
  "Drama","Fantasy","Horror","Mystery","Romance","Sci-Fi","Thriller",
];

export const SORT_OPTIONS = [
  "Recently Added", "Date Added ↓", "Date Added ↑", "A–Z", "Z–A",
  "Rating ↓", "Rating ↑",
  "Critic Rating ↓", "Critic Rating ↑",
  "Year ↓", "Year ↑",
  "Runtime ↓", "Runtime ↑",
  "Creator A–Z",
  "Series",
  "Type A–Z", "Type Z–A",
  "Genre A–Z", "Genre Z–A",
  "Status ↑", "Status ↓",
];

// Wishlist → In Progress → Consumed → Dropped, the natural progression a
// library item moves through — used both by the tile/list status pickers
// and by "Status ↑"/"Status ↓" sort (index order, not alphabetical, since
// alphabetical status names don't reflect any meaningful sequence).
export const STATUS_WHEEL_ORDER = ["wishlist", "not-started", "in-progress", "consumed", "dropped"];

// Shared by every "last action" undo toast (delete/hide/status change) —
// one consistent grace window rather than each action type picking its own.
export const UNDO_WINDOW_MS = 10000;

export const QUICK_FILTERS = ["All", "Wishlist", "Not Started", "In Progress", "Consumed", "Dropped"];

// "X & up" threshold buckets rather than a raw number input, matching the
// dropdown pattern every other TopBar filter already uses.
export const PERSONAL_RATING_BUCKETS = ["Any Rating", "+8 & up", "+5 & up", "+1 & up", "0 & up", "Below 0"];

// Scale matches criticRatingValue()'s normalized 0–10 output (ratings.js) —
// whatever source a title's critic_rating came from (IMDb, RT%, Metacritic),
// these buckets compare against the same number the Critic Rating sort uses.
export const CRITIC_RATING_BUCKETS = ["Any Critic Rating", "8+", "6+", "5+", "3+"];
