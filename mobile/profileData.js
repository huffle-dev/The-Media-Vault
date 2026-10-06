// Pure helpers for the item profile: which external-rating stats, links and
// source label apply to an item. Mirror the desktop profile's own inline
// logic (views/ItemProfile.jsx) — kept here rather than imported because that
// file is DOM code mobile can't load; worth promoting into packages/core if
// a third consumer appears.

const n = (v) => (typeof v === "number" ? v : null);
const count = (v) => (n(v) != null ? `${v.toLocaleString()} ratings` : null);

// [{ label, value, suffix, sub }] — whichever reference ratings this item's
// source actually supplied.
export function externalRatingStats(item) {
  const stats = [];
  const t = item.media_type;
  if (t === "Movie" || t === "TV") {
    if (item.imdb_rating != null) stats.push({ label: "IMDb", value: item.imdb_rating, suffix: "/10", sub: n(item.imdb_votes) != null ? `${item.imdb_votes.toLocaleString()} votes` : null });
    if (item.rotten_tomatoes_rating != null) stats.push({ label: "Rotten Tomatoes", value: item.rotten_tomatoes_rating, suffix: "%" });
    if (item.metacritic_rating != null) stats.push({ label: "Metacritic", value: item.metacritic_rating, suffix: "/100" });
    // A TMDB-sourced item's one and only rating.
    if (!stats.length && item.tmdb_rating != null) stats.push({ label: "TMDB", value: item.tmdb_rating, suffix: "/10", sub: n(item.tmdb_votes) != null ? `${item.tmdb_votes.toLocaleString()} votes` : null });
  } else if (t === "Board Game" && item.bgg_rating != null) {
    const sub = [item.bgg_rank != null ? `#${item.bgg_rank} Overall` : null, n(item.bgg_rating_count) != null ? `${item.bgg_rating_count.toLocaleString()} ratings` : null].filter(Boolean).join(" · ");
    stats.push({ label: "BGG Rating", value: item.bgg_rating, suffix: "/10", sub: sub || null });
  } else if (t === "Game") {
    if (item.metacritic_rating != null) stats.push({ label: "Metacritic", value: item.metacritic_rating, suffix: "/100" });
    if (item.igdb_rating != null) stats.push({ label: "IGDB Rating", value: item.igdb_rating, suffix: "/100", sub: count(item.igdb_rating_count) });
  } else if ((t === "Book" || t === "Audiobook") && item.openlibrary_rating != null) {
    stats.push({ label: String(item.platform_id || "").startsWith("audible-") ? "Audible" : "Open Library", value: item.openlibrary_rating.toFixed(2), suffix: "/5", sub: count(item.openlibrary_ratings_count) });
  } else if (t === "Music" && item.discogs_rating != null) {
    stats.push({ label: "Discogs", value: item.discogs_rating.toFixed(2), suffix: "/5", sub: count(item.discogs_ratings_count) });
  }
  return stats;
}

const spotifySearch = (item) =>
  `https://open.spotify.com/search/${encodeURIComponent(item.creator ? `${item.creator} ${item.title}` : item.title)}`;

// [{ key, label, href }] — only links that apply to this type and that the
// item has a value for. (Desktop's Launch button has no mobile equivalent.)
export function externalLinks(item) {
  const links = [];
  const t = item.media_type;
  const pid = String(item.platform_id || "");
  if ((t === "Movie" || t === "TV") && item.imdb_url) links.push({ key: "imdb", label: "IMDB", href: item.imdb_url, color: "#e3aa26" });
  if ((t === "Movie" || t === "TV") && item.trailer_url) links.push({ key: "trailer", label: "Trailer", href: item.trailer_url, color: "#f472b6" });
  if (t === "Game" && item.steam_url) links.push({ key: "steam", label: "Steam", href: item.steam_url, color: "#4be8c8" });
  if (t === "Game" && item.igdb_url) links.push({ key: "igdb", label: "IGDB", href: item.igdb_url, color: "#9147ff" });
  if (t === "Board Game" && item.bgg_url) links.push({ key: "bgg", label: "BGG", href: item.bgg_url, color: "#e84b4b" });
  if ((t === "Book" || t === "Audiobook") && pid) {
    if (pid.startsWith("audible-")) links.push({ key: "audible", label: "Audible", href: `https://www.audible.com/pd/${pid.slice("audible-".length)}`, color: "#f59e0b" });
    else links.push({ key: "openlibrary", label: "Open Library", href: `https://openlibrary.org/works/${pid}`, color: "#e3aa26" });
  }
  if ((t === "Book" || t === "Audiobook") && item.ebook_url) links.push({ key: "ebook", label: "Read on Archive.org", href: item.ebook_url, color: "#4be8c8" });
  if (t === "Web Video") {
    const href = item.url || (pid && !/^(video|playlist)-/.test(pid) ? `https://www.youtube.com/channel/${pid}` : null);
    if (href) links.push({ key: "youtube", label: "YouTube", href, color: "#f87171" });
  }
  if (t === "Website" && item.url) links.push({ key: "visit", label: "Visit Site", href: item.url, color: "#e3aa26" });
  if (t === "Music") {
    if (item.title) links.push({ key: "spotify", label: "Spotify", href: spotifySearch(item), color: "#1ed760" });
    if (item.discogs_url) links.push({ key: "discogs", label: "Discogs", href: item.discogs_url, color: "#f472b6" });
  }
  if (t === "Podcast") {
    if (item.podcast_url) links.push({ key: "podcast", label: "Apple Podcasts", href: item.podcast_url, color: "#fda4af" });
    if (item.title) links.push({ key: "spotify", label: "Spotify", href: spotifySearch(item), color: "#1ed760" });
  }
  return links;
}

export function sourceLabel(item) {
  if (!item.platform_id) return null;
  switch (item.media_type) {
    case "Movie": case "TV": return "TMDB";
    case "Book": case "Audiobook": return String(item.platform_id).startsWith("audible-") ? "Audible" : "Open Library";
    case "Music": return "Discogs";
    case "Board Game": return "BoardGameGeek";
    case "Web Video": return "YouTube";
    case "Podcast": return "Apple Podcasts";
    case "Game": return String(item.platform_id).startsWith("igdb-") ? "IGDB" : "Steam";
    case "Website": return "Open Graph";
    default: return null;
  }
}

// "Stream: Netflix · Rent: Apple TV" from the region-resolved columns.
export function whereToWatch(item) {
  const rows = [["Stream", item.watch_flatrate], ["Rent", item.watch_rent], ["Buy", item.watch_buy]]
    .filter(([, v]) => v && String(v).trim());
  return rows;
}

// Music: tracklist is a JSON string of {position,title,duration,owned?}.
export function parseTracklist(raw) {
  if (!raw) return [];
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
}
