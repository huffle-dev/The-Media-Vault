// Library tile display options, the phone's version of desktop's
// hooks/useDisplayPrefs.js: tile size, spacing and how much overlay a tile
// shows. Same option names and defaults (medium / small / full); remembered
// on this phone only, like desktop remembers them per install.
import { useCallback, useState } from "react";

const STORAGE_KEY = "mobile_display_prefs";
// layout: "grid" (tiles) or "list" (one compact row per item).
const DEFAULTS = { tileSize: "medium", tileGap: "small", tileOverlay: "full", layout: "grid" };

// Desktop packs as many min-width tiles as fit; on a phone the equivalent is
// a fixed number of columns per size.
export const TILE_COLUMNS = { small: 4, medium: 3, large: 2 };
// Desktop's 1 / 12 / 24 px gaps, scaled for a narrower screen. The default
// (small) is desktop's default too: tiles almost touching.
export const TILE_GAPS = { small: 1, medium: 6, large: 12 };

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return DEFAULTS;
  }
}

export function useDisplayPrefs() {
  const [prefs, setPrefs] = useState(load);
  const update = useCallback((patch) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* best-effort */ }
      return next;
    });
  }, []);
  return [prefs, update];
}
