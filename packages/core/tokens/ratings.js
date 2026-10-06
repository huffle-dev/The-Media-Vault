// Rating helpers — stored 1-20, displayed -10 to +10, plus the cross-type
// "one normalized number" helpers used by Stats and sorting. Split out of
// the old monolithic tokens.js.

import { T } from "./theme.js";

export const ratingToStored  = (display) => display + 11;
export const ratingToDisplay = (stored)  => stored - 11;

export const formatRating = (stored) => {
  if (stored === null || stored === undefined) return "—";
  const d = ratingToDisplay(stored);
  return d > 0 ? `+${d}` : `${d}`;
};

// An average of display ratings (a string like "4.6" or "-1.2", from libraryStats) shown the way a single
// rating is: with its "+" when above zero.
export const formatAverageRating = (avg) => {
  if (avg === null || avg === undefined || avg === "") return "—";
  const n = Number(avg);
  if (!Number.isFinite(n)) return "—";
  return n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1);
};

export const ratingColor = (stored) => {
  if (stored === null || stored === undefined) return T.muted;
  const d = ratingToDisplay(stored); // -10 to +10
  if (d > 0)  return "#4bb87a";
  if (d < 0)  return "#e84b6e";
  return T.muted;
};
// stored range: 1 (= -10) to 21 (= +10), 0 neutral = stored 11

// Shared by any quick status control (tile status wheel, list-row status
// cell) that changes status without going through AddEditModal's full form.
// Clears rating when leaving both ratable statuses, and defaults
// date_consumed to today when entering one without a date already set,
// same default AddEditModal's date field uses.
export const buildStatusChangePatch = (item, status) => {
  const patch = { status };
  if (status !== "consumed" && status !== "dropped") {
    patch.rating = null;
  } else if (!item.date_consumed) {
    patch.date_consumed = new Date().toISOString().split("T")[0];
  }
  return patch;
};

// Owned Locally toggle. The Wishlist/Not Started boundary tracks ownership,
// so flipping ownership carries that status across with it (same rule as
// AddEditModal, Item Profile and the bulk toolbar).
export const buildOwnedChangePatch = (item, isLocal) => {
  const patch = { is_local: isLocal ? 1 : 0 };
  if (isLocal && item.status === "wishlist") patch.status = "not-started";
  if (!isLocal && item.status === "not-started") patch.status = "wishlist";
  return patch;
};

// critic_rating is a display string like "IMDb 8.4/10 · RT 87% · Metacritic 74"
// (legacy OMDB items — OMDB itself was removed 2026-09-23, but old items
// still carry this format) or "TMDB 7.9/10 (12,345 votes)" (TMDB) — pull a
// single 0–10 number out regardless of source. Checks "X/10" first since
// that's always the leading segment.
export const criticRatingValue = (criticRating) => {
  if (!criticRating) return null;
  const outOf10 = criticRating.match(/(\d+(?:\.\d+)?)\s*\/\s*10/);
  if (outOf10) return parseFloat(outOf10[1]);
  const pct = criticRating.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pct) return parseFloat(pct[1]) / 10;
  const outOf100 = criticRating.match(/Metacritic\s+(\d+(?:\.\d+)?)/i);
  if (outOf100) return parseFloat(outOf100[1]) / 10;
  return null;
};

// One 0–10 "what do critics/the community think" number for Stats' Critic
// Rating chart/filter/sort, regardless of type — each type keeps its own
// rating field (critic_rating for Film/TV, metacritic_rating/igdb_rating for
// Game, bgg_rating for Board Game, discogs_rating for Music,
// openlibrary_rating for Book/Audiobook), normalized onto the same 0–10
// range criticRatingValue() uses (Game's Metacritic/IGDB are 0–100;
// Music/Book are 0–5; BGG is already 0–10). Game prefers Metacritic over
// IGDB when both are present, since that's the one Steam's store page shows.
export const externalRatingValue = (item) => {
  const mt = item.media_type;
  if (mt === "Movie" || mt === "TV") return criticRatingValue(item.critic_rating);
  if (mt === "Game") {
    if (item.metacritic_rating != null) return item.metacritic_rating / 10;
    if (item.igdb_rating != null) return item.igdb_rating / 10;
    return null;
  }
  if (mt === "Board Game") return item.bgg_rating ?? null;
  if (mt === "Music") return item.discogs_rating != null ? item.discogs_rating * 2 : null;
  if (mt === "Book" || mt === "Audiobook") return item.openlibrary_rating != null ? item.openlibrary_rating * 2 : null;
  return null;
};
