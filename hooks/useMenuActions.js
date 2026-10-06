// Menu-triggered Resync/Fetch actions (File/Resync menu, main.js) and the
// bottom-left status chip that confirms they ran.
//
// Each handler re-fetches the item list fresh via IPC rather than closing
// over the `items` state variable — they're bound once by main.js's
// mount-only menu-action dispatcher, so a captured `items` would go stale
// the moment the library changes after launch.
//
// Takes loadItems and fetchMissingArt (from useAutoUpdateOnLaunch) since
// these on-demand actions call the same sync/fetch logic the launch-time
// routines use, just triggered manually.
import { useState, useRef, useCallback } from "react";
import { runSteamSync } from "../sync/steamSync.js";
import { runGogSync } from "../sync/gogSync.js";

export function useMenuActions(loadItems, fetchMissingArt) {
  // Separate chip from autoUpdateStatus — its wording is specific to the
  // launch bundle and would be misleading for a single manual action.
  const [menuActionStatus, setMenuActionStatus] = useState(null); // null | { label, done }
  const menuActionDoneTimer = useRef(null);
  const flashMenuAction = useCallback((label, done = false) => {
    setMenuActionStatus({ label, done });
    if (done) {
      clearTimeout(menuActionDoneTimer.current);
      menuActionDoneTimer.current = setTimeout(() => setMenuActionStatus(null), 2500);
    }
  }, []);

  const handleMenuResyncSteam = useCallback(async () => {
    const [steamId, steamKey] = await Promise.all([
      window.vault.settings.get("steam_id"),
      window.vault.settings.get("steam_api_key"),
    ]);
    if (!steamId || !steamKey) { flashMenuAction("Steam isn't connected — add credentials in Settings", true); return; }
    flashMenuAction("Resyncing Steam Library…");
    try {
      const res = await runSteamSync({ steamId, apiKey: steamKey });
      if (res?.imported) loadItems({ silent: true });
    } catch { /* silent — same as the auto-launch sync would be */ }
    flashMenuAction("✓ Steam Library resynced", true);
  }, [loadItems, flashMenuAction]);

  const handleMenuResyncGog = useCallback(async () => {
    if (!(await window.vault.gog.isConnected())) { flashMenuAction("GOG isn't connected — log in from Settings", true); return; }
    flashMenuAction("Resyncing GOG Library…");
    try {
      const res = await runGogSync();
      if (res?.imported) loadItems({ silent: true });
    } catch { /* silent — same as the auto-launch sync would be */ }
    flashMenuAction("✓ GOG Library resynced", true);
  }, [loadItems, flashMenuAction]);

  const handleMenuFetchArt = useCallback(async () => {
    flashMenuAction("Fetching missing cover art…");
    const current = await window.vault.items.getAll();
    await fetchMissingArt(current);
    flashMenuAction("✓ Cover art fetch done", true);
  }, [fetchMissingArt, flashMenuAction]);

  const handleMenuFillMovieTv = useCallback(async () => {
    const current = await window.vault.items.getAll();
    const filmTv = current.filter(i => i.media_type === "Movie" || i.media_type === "TV");
    if (!filmTv.length) { flashMenuAction("No Movie/TV items in your library", true); return; }
    // No chip flash here — film.enrich reports its own progress separately.
    window.vault.movie.enrich(filmTv);
  }, [flashMenuAction]);

  const handleMenuFetchHltb = useCallback(async () => {
    const current = await window.vault.items.getAll();
    const games = current.filter(i => i.media_type === "Game");
    if (!games.length) { flashMenuAction("No Games in your library", true); return; }
    // force=true bypasses the hltb_checked_date gate, same as film:enrich.
    // No chip flash here — hltb.enrich reports its own progress separately.
    window.vault.hltb.enrich(games, true);
  }, [flashMenuAction]);

  const handleMenuResyncAll = useCallback(async () => {
    flashMenuAction("Resyncing everything…");
    const [steamId, steamKey] = await Promise.all([
      window.vault.settings.get("steam_id"),
      window.vault.settings.get("steam_api_key"),
    ]);
    const gogOn = await window.vault.gog.isConnected();
    try {
      if (steamId && steamKey) await runSteamSync({ steamId, apiKey: steamKey });
      if (gogOn) await runGogSync();
    } catch { /* silent — same as the individual resync actions would be */ }
    await loadItems({ silent: true });

    const current = await window.vault.items.getAll();
    await fetchMissingArt(current);
    const filmTv = current.filter(i => i.media_type === "Movie" || i.media_type === "TV");
    if (filmTv.length) window.vault.movie.enrich(filmTv);
    const games = current.filter(i => i.media_type === "Game");
    if (games.length) window.vault.hltb.enrich(games, true);

    flashMenuAction("✓ Resync everything done", true);
  }, [loadItems, fetchMissingArt, flashMenuAction]);

  return {
    menuActionStatus,
    handleMenuResyncSteam, handleMenuResyncGog,
    handleMenuResyncAll, handleMenuFetchArt, handleMenuFillMovieTv, handleMenuFetchHltb,
  };
}
