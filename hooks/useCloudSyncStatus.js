import { useEffect, useRef, useState } from "react";

// Live status of the background Cloud Sync (lib/autoSync.js in the main
// process): { state: "idle" | "syncing" | "ok" | "error", at, error,
// needsLogin, retryAt, mode, result: { pushed, inserted, updated, deleted,
// coverArtFetched } }. `onPulled` runs once per successful sync that brought
// changes down, so the library on screen reloads without a manual refresh.
export function useCloudSyncStatus(onPulled) {
  const [status, setStatus] = useState(null);
  const lastHandled = useRef(null);
  const pulled = useRef(onPulled);
  pulled.current = onPulled;

  useEffect(() => {
    let cancelled = false;
    const apply = (s) => {
      if (cancelled || !s) return;
      setStatus(s);
      if (s.state === "ok" && s.at && s.at !== lastHandled.current) {
        lastHandled.current = s.at;
        const r = s.result;
        if (r && (r.inserted || r.updated || r.deleted || r.coverArtFetched)) pulled.current?.();
      }
    };
    window.vault.cloudSync.status().then(apply).catch(() => {});
    const unsubscribe = window.vault.cloudSync.onStatus(apply);
    return () => { cancelled = true; unsubscribe(); };
  }, []);

  return status;
}
