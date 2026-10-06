// Manual Resync actions — Auto-Update toggle, Cover Art, Movie & TV
// Metadata, and HowLongToBeat — split out of ResyncTab.jsx so the component
// is pure layout. Movie & TV's two actions (fill missing / force refresh)
// used to each fetch and check the TMDB key independently; that check is
// now one shared helper, requireTmdbKey.
import { useState, useEffect } from "react";

export function useResyncActions(onLibraryUpdate) {
  const [autoUpdateOnLaunch, setAutoUpdateOnLaunch] = useState(false);

  const [bulkState, setBulkState] = useState(null); // null | { success, failed, total }
  const [bulkRunning, setBulkRunning] = useState(false);

  const [enrichState, setEnrichState]     = useState(null); // null | { done, total } | { error }
  const [enrichRunning, setEnrichRunning] = useState(false);

  const [hltbEnrichState, setHltbEnrichState]     = useState(null); // null | { done, total }
  const [hltbEnrichRunning, setHltbEnrichRunning] = useState(false);

  useEffect(() => {
    const unsubFilm = window.vault.movie.onProgress(p => {
      setEnrichState(p);
      if (p.done === p.total) setEnrichRunning(false);
    });
    const unsubHltb = window.vault.hltb.onProgress(p => {
      setHltbEnrichState(p);
      if (p.done === p.total) setHltbEnrichRunning(false);
    });
    // Without this, each Settings open/close cycle left the previous
    // listener attached — a slow leak that fires setState once per
    // accumulated listener instead of once.
    return () => { unsubFilm(); unsubHltb(); };
  }, []);

  useEffect(() => {
    window.vault.settings.get("auto_update_on_launch").then(v => {
      setAutoUpdateOnLaunch(v === "1");
    });
  }, []);

  const handleToggleAutoUpdateOnLaunch = (checked) => {
    setAutoUpdateOnLaunch(checked);
    window.vault.settings.set("auto_update_on_launch", checked ? "1" : "0");
  };

  const handleBulkFetch = async () => {
    setBulkRunning(true);
    setBulkState({ success: 0, failed: 0, total: 0 });

    const items   = await window.vault.items.getAll();
    const missing = items.filter(i => !i.cover_art_path && ["Movie","TV","Book","Audiobook","Game"].includes(i.media_type));
    let success = 0;
    let failed  = 0;

    setBulkState({ success: 0, failed: 0, total: missing.length });

    // Manual trigger, so every missing-art item is retried regardless of
    // cover_art_checked_date. Still stamps the date on completion (success,
    // or a genuine not-found) so Auto-Update-on-Launch doesn't immediately
    // redo the work.
    const today = new Date().toISOString().split("T")[0];
    for (const item of missing) {
      try {
        // platformId matters for Game specifically — without it, coverArt:fetch
        // can't tell a GOG game from a Steam one and falls back to a
        // fuzzy Steam title search that can match the wrong game entirely.
        const localPath = await window.vault.coverArt.fetch({
          title:      item.title,
          year:       item.year,
          mediaType:  item.media_type,
          imdbUrl:    item.imdb_url || null,
          platformId: item.platform_id || null,
        });
        // updateFields, not items:update — cover_art_checked_date isn't a
        // form field, so updateItem()'s column whitelist would drop it.
        await window.vault.items.updateFields(item.id, { cover_art_path: localPath, cover_art_checked_date: today });
        success++;
      } catch {
        try { await window.vault.items.updateFields(item.id, { cover_art_checked_date: today }); } catch {}
        failed++;
      }
      setBulkState({ success, failed, total: missing.length });
    }

    setBulkRunning(false);
    if (onLibraryUpdate) onLibraryUpdate();
  };

  // Shared by both Movie & TV actions below — previously each fetched and
  // checked the key independently. Returns the key, or null after setting
  // enrichState's error itself (so callers can just early-return on null).
  const requireTmdbKey = async () => {
    const tmdbKey = await window.vault.settings.get("tmdb_api_key");
    if (!tmdbKey) {
      setEnrichState({ error: "Add a TMDB API key in API Keys first." });
      return null;
    }
    return tmdbKey;
  };

  const getFilmTv = async () => {
    const items = await window.vault.items.getAll();
    return items.filter(i => i.media_type === "Movie" || i.media_type === "TV");
  };

  const handleFilmEnrich = async () => {
    if (!(await requireTmdbKey())) return;
    setEnrichRunning(true);
    setEnrichState(null);
    // Streams progress back via onProgress (registered above) — not
    // awaited here. force:true re-checks every item, not just new ones.
    window.vault.movie.enrich(await getFilmTv(), true);
  };

  // forceOverwrite: true — re-fetches and overwrites every Film/TV item's
  // metadata, not just missing fields. The normal button above can never
  // correct an already-populated field, by design — this is the escape hatch.
  const handleFilmForceRefresh = async () => {
    if (!(await requireTmdbKey())) return;
    if (!confirm("Re-fetch and overwrite every Movie/TV item's metadata, including fields already filled in? This can't be undone.")) return;
    setEnrichRunning(true);
    setEnrichState(null);
    window.vault.movie.enrich(await getFilmTv(), true, true);
  };

  const handleHltbEnrich = async () => {
    setHltbEnrichRunning(true);
    setHltbEnrichState(null);

    const items = await window.vault.items.getAll();
    const games = items.filter(i => i.media_type === "Game");
    // Streams progress back via onProgress (registered above) — not awaited
    // here. force:true re-checks every item, not just new ones.
    window.vault.hltb.enrich(games, true);
  };

  return {
    autoUpdateOnLaunch, handleToggleAutoUpdateOnLaunch,
    bulkState, bulkRunning, handleBulkFetch,
    enrichState, enrichRunning, handleFilmEnrich, handleFilmForceRefresh,
    hltbEnrichState, hltbEnrichRunning, handleHltbEnrich,
  };
}
