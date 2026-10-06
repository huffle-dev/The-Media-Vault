// Pure, side-effect-free extraction of per-source rating fields from each
// API's raw response shape. Split out from main.js so this parsing has
// direct unit test coverage without needing Electron, network, or DB
// context. See ratingParsers.test.js.

// TMDB never has Rotten Tomatoes/Metacritic — just its own vote_average/
// vote_count, a different metric than IMDb's rating. (OMDB, which used to
// supply IMDb/RT/Metacritic ratings, was removed 2026-09-23 — TMDB is now
// the only Movie/TV metadata source. imdb_rating/rotten_tomatoes_rating/
// metacritic_rating remain real database columns and are still displayed
// for legacy items that already have them, but nothing populates them for
// new items anymore — see BACKLOG.md.)
function parseTmdbRating(data) {
  const criticRating = data.vote_average
    ? `TMDB ${data.vote_average.toFixed(1)}/10${data.vote_count ? ` (${data.vote_count.toLocaleString()} votes)` : ""}`
    : null;
  return {
    criticRating,
    tmdb_rating: data.vote_average ? Math.round(data.vote_average * 10) / 10 : null,
    tmdb_votes: data.vote_count || null,
  };
}

module.exports = { parseTmdbRating };
