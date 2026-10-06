// "Where to Watch" streaming-availability settings — region, provider
// options, availability types (flatrate/rent/buy/free) — plus the
// provider-check progress chip and its own onWatchChecked/onWatchProgress
// IPC listeners.
//
// Does NOT own the auto-enrich toggles (autoEnrichFilmTV, hasFilmApiKey,
// autoEnrichHltb) — those gate the Film/TV and HLTB auto-enrich passes,
// which belong with the auto-update-on-launch hook, not streaming
// availability. App.jsx calls this hook's loadWatchSettings alongside its
// own loadAutoEnrichSettings.
//
// Takes setItems since onWatchChecked patches the items array in place
// with freshly-checked provider data.
import { useState, useRef, useEffect, useCallback } from "react";

export function useWatchSettings(setItems) {
  const [watchProgress, setWatchProgress] = useState(null); // null | { done, total }
  const watchDoneTimer = useRef(null);
  const [watchRegion, setWatchRegion] = useState("US"); // read here, edited in Settings
  // Set true by SettingsModal the instant the country dropdown is touched —
  // safe to always attempt a recheck once touched, since the "skip
  // already-checked items" logic below makes an unnecessary recheck cheap.
  const watchRegionTouchedRef = useRef(false);
  const [watchProviderOptions, setWatchProviderOptions] = useState([]); // read here, edited in Settings
  const [watchAvailabilityTypes, setWatchAvailabilityTypes] = useState(["flatrate", "rent", "buy", "free"]);

  useEffect(() => {
    // Where to Watch filter — checking (or re-checking stale) providers for
    // whatever's currently in view when a provider is picked from the filter.
    window.vault.movie.onWatchChecked(item => {
      setItems(prev => prev.map(i => i.id === item.id ? item : i));
    });
    window.vault.movie.onWatchProgress(p => {
      setWatchProgress(p);
      if (p.done === p.total) {
        clearTimeout(watchDoneTimer.current);
        watchDoneTimer.current = setTimeout(() => setWatchProgress(null), 2000);
      }
    });
  }, [setItems]);

  // Re-read whenever Settings closes too, since region/provider/availability
  // choices can change there. `recheckWatch` fires a whole-library
  // watch-provider recheck when Settings closes after the country dropdown
  // was touched — checkWatchProviders caches per-item per-country and skips
  // anything already checked today, so an unnecessary call is a cheap no-op.
  const loadWatchSettings = useCallback((recheckWatch = false) => {
    window.vault.settings.get("watch_region").then(async v => {
      if (!v) return;
      setWatchRegion(v);
      if (recheckWatch) {
        const current = await window.vault.items.getAll();
        const filmTv = current.filter(i => i.media_type === "Movie" || i.media_type === "TV");
        if (filmTv.length) window.vault.movie.checkWatchProviders(filmTv);
      }
    });
    window.vault.settings.get("watch_provider_options").then(v => {
      if (v) { try { setWatchProviderOptions(JSON.parse(v)); } catch {} }
    });
    window.vault.settings.get("watch_availability_types").then(v => {
      if (v) { try { setWatchAvailabilityTypes(JSON.parse(v)); } catch {} }
    });
  }, []);

  return {
    watchProgress, setWatchProgress,
    watchRegion, watchRegionTouchedRef,
    watchProviderOptions, watchAvailabilityTypes,
    loadWatchSettings,
  };
}
