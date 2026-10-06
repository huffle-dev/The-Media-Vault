// The Library's "Where to stream" filter data: loads (or reuses) the providers index for
// the country saved on this phone. See watchIndex.js.
import { useCallback, useState } from "react";
import { supabase } from "./supabase";
import { loadWatchIndex, readIndexCache, writeIndexCache } from "./watchIndex";
import { regionChoices, savedRegion } from "./watchData";
import { movie } from "./mediaServices";

export function useWatchIndex() {
  const [state, setState] = useState({ index: null, region: null, loading: false, loaded: 0, error: null, builtAt: null });

  // `force` downloads again even if a saved copy exists.
  const load = useCallback(async ({ force = false } = {}) => {
    const codes = regionChoices(() => movie.getWatchRegionOptions(), []).map((c) => c.code);
    const region = savedRegion(codes.length ? codes : null);
    if (!force) {
      const cached = readIndexCache(region);
      if (cached) { setState({ index: cached.index, region, loading: false, loaded: cached.index.size, error: null, builtAt: cached.builtAt }); return; }
    }
    setState((s) => ({ ...s, region, loading: true, loaded: 0, error: null }));
    try {
      const index = await loadWatchIndex(supabase, region, { onProgress: ({ done }) => setState((s) => ({ ...s, loaded: done })) });
      const builtAt = Date.now();
      writeIndexCache(region, index, builtAt);
      setState({ index, region, loading: false, loaded: index.size, error: null, builtAt });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message }));
    }
  }, []);

  return { ...state, load };
}
