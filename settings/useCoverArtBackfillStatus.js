import { useEffect, useState } from "react";

// Live state of the background cover-art link gathering that follows a Cloud
// Sync (main.js's startCoverArtBackfill): { running, done, total, recorded }.
// Reads the current state on mount too, since Settings may be opened
// mid-run.
export function useCoverArtBackfillStatus() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let cancelled = false;
    window.vault.cloudSync.coverArtStatus().then((s) => { if (!cancelled) setStatus(s); }).catch(() => {});
    const unsubscribe = window.vault.cloudSync.onCoverArtProgress(setStatus);
    return () => { cancelled = true; unsubscribe(); };
  }, []);
  return status;
}
