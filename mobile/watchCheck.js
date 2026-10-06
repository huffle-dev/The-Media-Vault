// Checking where a film or show can be watched: one TMDB call that returns every country,
// saved on the item (so it syncs to desktop and powers the Where to Watch card and the
// Library's stream filter). Pure — services and client are passed in — so
// test/mobileWatchCheck.test.js runs without Expo.

// An item that is worth checking: a Movie or TV with a TMDB (or IMDb) id, never checked or
// last checked more than `maxAgeDays` ago.
export function needsWatchCheck(item, today, maxAgeDays = 7) {
  if (item.media_type !== "Movie" && item.media_type !== "TV") return false;
  if (!item.platform_id) return false;
  if (!item.watch_checked_date) return true;
  const age = (Date.parse(today) - Date.parse(item.watch_checked_date)) / 86400000;
  return !(age < maxAgeDays);
}

// Looks it up and saves it. Resolves to the patch that was written (so a caller can show it).
// An old IMDb-style id is resolved to its TMDB id first and upgraded for good, like desktop.
export async function checkWatchProviders({ client, movie, tmdbKey, item, today = new Date().toISOString().split("T")[0] }) {
  if (!tmdbKey) throw new Error("Needs your TMDB key — unlock it in Settings → API keys & sync.");
  if (!item.platform_id) throw new Error("This item has no TMDB link to check.");
  let tmdbId = item.platform_id;
  if (/^tt\d+$/.test(tmdbId)) {
    tmdbId = await movie.resolveTmdbIdFromImdb(item.media_type, tmdbId, tmdbKey);
    if (!tmdbId) throw new Error("No TMDB match for this IMDb id.");
  }
  const providers = await movie.fetchWatchProviders(item.media_type, tmdbId, tmdbKey);
  const patch = {
    platform_id: tmdbId,
    watch_providers: JSON.stringify(providers),
    watch_checked_date: today,
    updated_at: new Date().toISOString(),
  };
  const { error } = await client.from("items").update(patch).eq("sync_id", item.sync_id);
  if (error) throw new Error(error.message);
  return patch;
}
