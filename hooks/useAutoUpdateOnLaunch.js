// Everything that runs automatically at app launch to keep the library
// fresh — Steam/GOG library sync, GOG local-install rescan,
// Film/TV and HowLongToBeat auto-enrich, and the missing-cover-art sweep —
// plus the opt-in/opt-out toggles that gate them and the corner-chip
// progress state for each.
//
// withAutoEnrichGate/withHltbGate/fetchMissingArt are also reused by
// App.jsx's menu-triggered Resync/Fetch actions and quick-add/import paths
// on demand, not just automatically at launch.
//
// Takes loadItems/setItems as explicit parameters since every sync/enrich
// routine here needs to refresh or patch the core items array, which lives
// in the item-CRUD hook.
import { useState, useRef, useEffect, useCallback } from "react";
import { runSteamSync } from "../sync/steamSync.js";
import { runGogSync } from "../sync/gogSync.js";
import { runCloudSync } from "../sync/cloudSync.js";

export function useAutoUpdateOnLaunch(loadItems, setItems) {
  // Auto-enrichment opt-out (Settings → API Keys). autoEnrichFilmTV is the
  // user's stored preference; hasFilmApiKey is a live check of whether it
  // could even succeed — gating on both avoids a doomed-to-fail API call.
  const [autoEnrichFilmTV, setAutoEnrichFilmTV] = useState(true);
  const [hasFilmApiKey, setHasFilmApiKey] = useState(true);
  const autoEnrichActive = autoEnrichFilmTV && hasFilmApiKey;

  // HowLongToBeat auto-enrich — opt-IN, unlike Film/TV above, since HLTB has
  // no official API and defaulting to off keeps request volume deliberate.
  const [autoEnrichHltb, setAutoEnrichHltb] = useState(false);

  const [enrichProgress, setEnrichProgress] = useState(null); // null | { done, total }
  const enrichDoneTimer = useRef(null);
  const [filmEnrichProgress, setFilmEnrichProgress] = useState(null); // null | { done, total }
  const filmEnrichDoneTimer = useRef(null);
  const [hltbEnrichProgress, setHltbEnrichProgress] = useState(null); // null | { done, total }
  const hltbEnrichDoneTimer = useRef(null);
  const [gogEnrichProgress, setGogEnrichProgress] = useState(null); // null | { done, total }
  const gogEnrichDoneTimer = useRef(null);
  const [autoUpdateStatus, setAutoUpdateStatus] = useState(null); // null | "running" | "done"
  const autoUpdateDoneTimer = useRef(null);

  useEffect(() => {
    window.vault.steam.onEnriched(item => {
      setItems(prev => prev.map(i => i.id === item.id ? item : i));
    });
    window.vault.steam.onProgress(p => {
      setEnrichProgress(p);
      if (p.done === p.total) {
        clearTimeout(enrichDoneTimer.current);
        enrichDoneTimer.current = setTimeout(() => setEnrichProgress(null), 2000);
      }
    });
    // Film/TV metadata backfill — live-patch the grid per item, with a corner
    // chip so progress stays visible after Settings closes.
    window.vault.movie.onEnriched(item => {
      setItems(prev => prev.map(i => i.id === item.id ? item : i));
    });
    window.vault.movie.onProgress(p => {
      setFilmEnrichProgress(p);
      if (p.done === p.total) {
        clearTimeout(filmEnrichDoneTimer.current);
        filmEnrichDoneTimer.current = setTimeout(() => setFilmEnrichProgress(null), 2000);
      }
    });
    // HowLongToBeat completion-time backfill — same pattern as above.
    window.vault.hltb.onEnriched(item => {
      setItems(prev => prev.map(i => i.id === item.id ? item : i));
    });
    window.vault.hltb.onProgress(p => {
      setHltbEnrichProgress(p);
      if (p.done === p.total) {
        clearTimeout(hltbEnrichDoneTimer.current);
        hltbEnrichDoneTimer.current = setTimeout(() => setHltbEnrichProgress(null), 2000);
      }
    });
    // GOG game details backfill — same pattern as Steam's enrichProgress above.
    window.vault.gog.onEnriched(item => {
      setItems(prev => prev.map(i => i.id === item.id ? item : i));
    });
    window.vault.gog.onProgress(p => {
      setGogEnrichProgress(p);
      if (p.done === p.total) {
        clearTimeout(gogEnrichDoneTimer.current);
        gogEnrichDoneTimer.current = setTimeout(() => setGogEnrichProgress(null), 2000);
      }
    });
  }, [setItems]);

  // Auto-enrichment settings (Settings → API Keys) — re-read wherever
  // watch settings are, since Settings can change either while open.
  const loadAutoEnrichSettings = useCallback(() => {
    Promise.all([
      window.vault.settings.get("auto_enrich_film_tv"),
      window.vault.settings.get("tmdb_api_key"),
      window.vault.settings.get("auto_enrich_hltb"),
    ]).then(([stored, tmdb, hltbStored]) => {
      setHasFilmApiKey(!!tmdb);
      setAutoEnrichFilmTV(stored === null || stored === undefined ? true : stored === "1");
      setAutoEnrichHltb(hltbStored === "1");
    });
  }, []);

  // Settings → Resync → "Automatically run these on every launch". Each
  // source only runs if it already has what it needs — skips silently
  // otherwise, same as the manual Resync buttons would. autoUpdateStatus
  // covers the whole batch, including the otherwise-silent Steam/Cover Art
  // steps that don't get their own progress chip.
  const runAutoUpdateOnLaunch = useCallback(async () => {
    const enabled = await window.vault.settings.get("auto_update_on_launch");
    if (enabled !== "1") return;

    setAutoUpdateStatus("running");

    const [tmdbKey, steamId, steamKey, region, hltbAuto] = await Promise.all([
      window.vault.settings.get("tmdb_api_key"),
      window.vault.settings.get("steam_id"),
      window.vault.settings.get("steam_api_key"),
      window.vault.settings.get("watch_region"),
      window.vault.settings.get("auto_enrich_hltb"),
    ]);

    if (steamId && steamKey) {
      try {
        const res = await runSteamSync({ steamId, apiKey: steamKey });
        if (res?.imported) loadItems({ silent: true });
      } catch { /* silent — same as a failed background sync would be */ }
    }

    const current = await window.vault.items.getAll();
    const filmTv = current.filter(i => i.media_type === "Movie" || i.media_type === "TV");

    if (tmdbKey && filmTv.length) {
      window.vault.movie.enrich(filmTv);
    }
    if (tmdbKey && region && filmTv.length) {
      window.vault.movie.checkWatchProviders(filmTv);
    }
    if (hltbAuto === "1") {
      const games = current.filter(i => i.media_type === "Game");
      if (games.length) window.vault.hltb.enrich(games);
    }

    // cover_art_checked_date gates this — without it, an item with no art
    // available anywhere would be re-attempted on every launch forever.
    // Only ever attempted once automatically; the manual "Fetch Missing
    // Art" button still retries everything on demand.
    const today = new Date().toISOString().split("T")[0];
    const missingArt = current.filter(i =>
      !i.cover_art_path && !i.cover_art_checked_date &&
      ["Movie","TV","Book","Audiobook","Game"].includes(i.media_type)
    );
    for (const item of missingArt) {
      try {
        // platformId matters for Game specifically — without it, coverArt:fetch
        // can't tell a GOG game from a Steam one and falls back to a
        // fuzzy Steam title search that can match the wrong game entirely.
        const localPath = await window.vault.coverArt.fetch({
          title: item.title, year: item.year, mediaType: item.media_type, imdbUrl: item.imdb_url || null,
          platformId: item.platform_id || null,
        });
        // updateFields, not items:update — cover_art_checked_date isn't a
        // form field, so updateItem()'s column whitelist would drop it.
        await window.vault.items.updateFields(item.id, { cover_art_path: localPath, cover_art_checked_date: today });
      } catch {
        try { await window.vault.items.updateFields(item.id, { cover_art_checked_date: today }); } catch {}
      }
    }
    if (missingArt.length) loadItems({ silent: true });

    setAutoUpdateStatus("done");
    clearTimeout(autoUpdateDoneTimer.current);
    autoUpdateDoneTimer.current = setTimeout(() => setAutoUpdateStatus(null), 2000);
  }, [loadItems]);

  // Steam-only launch sync — for users who don't want the broader bundle
  // above. Skips if that bundle is on, so both toggles checked doesn't
  // sync Steam twice.
  const runAutoSteamSyncOnLaunch = useCallback(async () => {
    const [steamOnly, bundleEnabled] = await Promise.all([
      window.vault.settings.get("auto_steam_sync_on_launch"),
      window.vault.settings.get("auto_update_on_launch"),
    ]);
    if (steamOnly !== "1" || bundleEnabled === "1") return;

    const [steamId, steamKey] = await Promise.all([
      window.vault.settings.get("steam_id"),
      window.vault.settings.get("steam_api_key"),
    ]);
    if (!steamId || !steamKey) return;

    try {
      const res = await runSteamSync({ steamId, apiKey: steamKey });
      if (res?.imported) loadItems({ silent: true });
    } catch { /* silent — same as the bundle's own Steam step would be */ }
  }, [loadItems]);

  // GOG-only launch sync — same pattern as Steam above, but GOG isn't part
  // of the bundle at all, so no overlap check is needed.
  const runAutoGogSyncOnLaunch = useCallback(async () => {
    const gogAuto = await window.vault.settings.get("auto_gog_sync_on_launch");
    if (gogAuto !== "1") return;

    const connected = await window.vault.gog.isConnected();
    if (!connected) return;

    try {
      const res = await runGogSync();
      if (res?.imported) loadItems({ silent: true });
    } catch { /* silent — same as Steam's own launch sync */ }
  }, [loadItems]);

  // Cloud Sync launch sync — same pattern as Steam/GOG above, but runs
  // push+pull rather than a one-way library import.
  const runAutoCloudSyncOnLaunch = useCallback(async () => {
    const cloudSyncAuto = await window.vault.settings.get("auto_cloud_sync_on_launch");
    if (cloudSyncAuto !== "1") return;

    const connected = await window.vault.cloudSync.isConnected();
    if (!connected) return;

    try {
      const res = await runCloudSync();
      if (res?.pulled?.inserted || res?.pulled?.updated || res?.pulled?.deleted) loadItems({ silent: true });
    } catch { /* silent — same as Steam/GOG's own launch sync */ }
  }, [loadItems]);

  // Re-checks which GOG games are installed locally so a freshly-installed
  // game gets its Launch button without a manual resync. Not behind a
  // toggle like the sibling auto-syncs — a local registry read has no real
  // cost.
  const runGogInstallScanOnLaunch = useCallback(async () => {
    try {
      const res = await window.vault.gog.scanInstalled();
      if (res?.updated?.length) loadItems({ silent: true });
    } catch { /* silent — same as the sibling auto-syncs */ }
  }, [loadItems]);

  // Auto-enrichment opt-out only affects Film/TV (the TMDB lookups) —
  // other types' auto cover-art fetch is untouched either way.
  const withAutoEnrichGate = useCallback((itemList) => {
    if (autoEnrichActive) return itemList;
    return itemList.filter(i => i.media_type !== "Movie" && i.media_type !== "TV");
  }, [autoEnrichActive]);

  // Separate from withAutoEnrichGate above, which only narrows the list and
  // can't double as the HLTB gate. This one is opt-in: empty unless the
  // user has explicitly turned HLTB auto-enrich on.
  const withHltbGate = useCallback((itemList) => {
    if (!autoEnrichHltb) return [];
    return itemList.filter(i => i.media_type === "Game");
  }, [autoEnrichHltb]);

  const fetchMissingArt = useCallback(async (itemList) => {
    const needsArt = itemList.filter(i =>
      !i.cover_art_path &&
      ["Movie","TV","Book","Audiobook","Game","Board Game"].includes(i.media_type)
    );
    const today = new Date().toISOString().split("T")[0];
    for (const item of needsArt) {
      try {
        const artPath = await window.vault.coverArt.fetch({
          title:      item.title,
          year:       item.year || null,
          mediaType:  item.media_type,
          imdbUrl:    item.imdb_url || null,
          platformId: item.platform_id || null,
        });
        // updateFields, not items:update — cover_art_checked_date and
        // date_added aren't form-editable fields, so updateItem()'s column
        // whitelist would silently drop both.
        const withArt = await window.vault.items.updateFields(item.id, { cover_art_path: artPath, cover_art_checked_date: today, date_added: item.date_added || today });
        setItems(prev => prev.map(i => i.id === withArt.id ? withArt : i));
      } catch (err) {
        console.warn(`[fetchMissingArt] failed for "${item.title}":`, err.message);
        // Stamped as checked even on failure (except a temporary "daily
        // limit" rate-limit) — same reasoning as the auto-launch sweep.
        if (err?.message?.toLowerCase().includes("daily limit")) continue;
        try {
          const stamped = await window.vault.items.updateFields(item.id, { cover_art_checked_date: today });
          setItems(prev => prev.map(i => i.id === stamped.id ? stamped : i));
        } catch {}
      }
    }
  }, [setItems]);

  return {
    enrichProgress, filmEnrichProgress, hltbEnrichProgress, gogEnrichProgress,
    autoUpdateStatus,
    loadAutoEnrichSettings,
    runAutoUpdateOnLaunch, runAutoSteamSyncOnLaunch, runAutoGogSyncOnLaunch,
    runAutoCloudSyncOnLaunch,
    runGogInstallScanOnLaunch,
    withAutoEnrichGate, withHltbGate, fetchMissingArt,
  };
}
