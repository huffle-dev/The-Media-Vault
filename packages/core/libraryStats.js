// Pure aggregations over the library list for the History and Stats screens
// (written for the mobile app; the desktop views compute the same numbers
// inline and could adopt these). No React, no Node — safe for both apps.
import { ratingToDisplay, externalRatingValue } from "./tokens/ratings.js";
import { getTypeConfig, TYPE_FIELDS } from "./tokens/mediaTypes.js";

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const splitGenres = (genreStr) => (genreStr || "").split(",").map((g) => g.trim()).filter(Boolean);

// Every completed item, newest first, grouped by "Month Year" — undated
// items land in one trailing "Undated" group. Returns
// [{ key, title, data: [item] }] (SectionList's shape).
export function groupCompletedHistory(items) {
  const completed = items
    .filter((i) => i.status === "consumed")
    .sort((a, b) => {
      if (a.date_consumed && b.date_consumed) {
        return b.date_consumed.localeCompare(a.date_consumed) || (a.title || "").localeCompare(b.title || "");
      }
      if (a.date_consumed) return -1;
      if (b.date_consumed) return 1;
      return (a.title || "").localeCompare(b.title || "");
    });

  const groups = new Map();
  for (const item of completed) {
    let key, title;
    if (item.date_consumed) {
      const [y, m] = item.date_consumed.split("-");
      key = `${y}-${m}`;
      title = `${MONTH_NAMES[parseInt(m, 10) - 1] ?? m} ${y}`;
    } else {
      key = "undated";
      title = "Undated";
    }
    if (!groups.has(key)) groups.set(key, { key, title, data: [] });
    groups.get(key).data.push(item);
  }
  return [...groups.values()];
}

// Row counts + average personal rating (Completed and Dropped both count —
// an opinion on something you dropped is still a rating signal).
export function statusBreakdown(items) {
  const consumed = items.filter((i) => i.status === "consumed");
  const dropped = items.filter((i) => i.status === "dropped");
  const rated = [...consumed, ...dropped].filter((i) => i.rating);
  return {
    total: items.length,
    consumed: consumed.length,
    inProgress: items.filter((i) => i.status === "in-progress").length,
    wishlist: items.filter((i) => i.status === "wishlist").length,
    notStarted: items.filter((i) => i.status === "not-started").length,
    dropped: dropped.length,
    avgRating: rated.length
      ? (rated.reduce((sum, i) => sum + ratingToDisplay(i.rating), 0) / rated.length).toFixed(1)
      : null,
  };
}

// Personal rating histogram on the -10..+10 display scale.
export function ratingHistogram(items) {
  const counts = new Map();
  for (let d = -10; d <= 10; d++) counts.set(d, 0);
  for (const i of items) {
    if (i.rating == null) continue;
    const d = ratingToDisplay(i.rating);
    counts.set(d, (counts.get(d) || 0) + 1);
  }
  return [...counts.entries()].map(([display, count]) => ({ display, count }));
}

// Critic/external rating histogram, each item's own source normalized to
// 0-10 (externalRatingValue) and rounded to the nearest integer.
export function criticHistogram(items) {
  const counts = new Map();
  for (let v = 0; v <= 10; v++) counts.set(v, 0);
  for (const i of items) {
    const raw = externalRatingValue(i);
    if (raw == null) continue;
    const v = Math.min(10, Math.max(0, Math.round(raw)));
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  return [...counts.entries()].map(([value, count]) => ({ value, count }));
}

// Games with hours played (runtime is repurposed as hours for this type).
export function mostPlayed(items, limit = 8) {
  const played = items.filter((i) => i.media_type === "Game" && i.runtime > 0);
  return {
    ranked: [...played].sort((a, b) => b.runtime - a.runtime).slice(0, limit),
    totalHours: played.reduce((sum, i) => sum + i.runtime, 0),
  };
}

// Types with a genre-like field (derived from TYPE_FIELDS so it stays
// correct if a type's fields change).
export const GENRE_TYPES = Object.keys(TYPE_FIELDS).filter((t) => TYPE_FIELDS[t].some((f) => f.key === "genre"));

// One row per genre, most common first, segments stacked by media type in a
// fixed GENRE_TYPES order so every bar reads left-to-right consistently.
export function genreBreakdown(items, limit = 15) {
  const byGenre = new Map();
  for (const i of items) {
    if (!GENRE_TYPES.includes(i.media_type)) continue;
    for (const g of splitGenres(i.genre)) {
      if (!byGenre.has(g)) byGenre.set(g, { genre: g, total: 0, byType: new Map() });
      const entry = byGenre.get(g);
      entry.total += 1;
      entry.byType.set(i.media_type, (entry.byType.get(i.media_type) || 0) + 1);
    }
  }
  return [...byGenre.values()]
    .map((g) => ({
      genre: g.genre,
      total: g.total,
      segments: [...g.byType.entries()]
        .map(([type, count]) => ({ type, count, color: getTypeConfig(type).color }))
        .sort((a, b) => GENRE_TYPES.indexOf(a.type) - GENRE_TYPES.indexOf(b.type)),
    }))
    .sort((a, b) => b.total - a.total || a.genre.localeCompare(b.genre))
    .slice(0, limit);
}
