// The app's one problems log (see diagLog.js), kept on the phone between runs.
import "expo-sqlite/localStorage/install";
import { createLog } from "./diagLog";

export const diag = createLog({
  store: {
    getItem: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    setItem: (k, v) => { try { localStorage.setItem(k, v); } catch { /* best-effort */ } },
  },
});

export const VIEWED_KEY = "mobile_diag_viewed";
export const lastViewed = () => { try { return Number(localStorage.getItem(VIEWED_KEY)) || 0; } catch { return 0; } };
export const markViewed = () => { try { localStorage.setItem(VIEWED_KEY, String(Date.now())); } catch { /* best-effort */ } };

// The time (ms) the person last chose to carry on after a crash; a crash older than this is "seen".
const ACK_KEY = "mobile_diag_fatal_ack";
export const fatalAckedAt = () => { try { return Number(localStorage.getItem(ACK_KEY)) || 0; } catch { return 0; } };
export const ackFatal = () => { try { localStorage.setItem(ACK_KEY, String(Date.now())); } catch { /* best-effort */ } };
