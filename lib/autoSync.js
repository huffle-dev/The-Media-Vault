// Cloud Sync scheduler for the desktop app: syncs on its own so an edit
// reaches the cloud (and the phone) without clicking Sync Now.
//
// Plain logic with every dependency injected (clock, change marker, the sync
// itself), so test/autoSync.test.js drives it with a fake clock. main.js builds
// the real one and routes EVERY sync through it — the Sync Now button, the
// launch sync and the background ones — so they share one lock and one status.
//
// When it syncs (mode "auto" only):
//   • about a minute after the last edit (QUIET_MS), or at most MAX_WAIT_MS
//     after the first of a long burst of edits (an import never starves it);
//   • when the window regains focus, if the last sync is over a minute old;
//   • every PULL_INTERVAL_MS regardless, to pick up what other devices changed.
// A failure is retried with a growing delay (1, 2, then 5 minutes) — except
// "log in again", which stops the retries until the user does.
//
// "Did anything change?" is a cheap marker (SQLite's total_changes()), not a
// per-table diff: after each sync the marker is re-read as the new baseline, so
// the sync's own writes never count as an edit. A write that isn't an edit
// (a background cover-art record) costs at most one cheap push.

const QUIET_MS = 60_000;
const MAX_WAIT_MS = 180_000;
const PULL_INTERVAL_MS = 5 * 60_000;
const FOCUS_MIN_GAP_MS = 60_000;
const RETRY_DELAYS_MS = [60_000, 120_000, 300_000];
const TICK_MS = 15_000;

// Errors that retrying cannot fix: the stored login no longer works.
const NEEDS_LOGIN = /log in|sign in|session expired|refresh token|not logged/i;

function createAutoSync({
  getMode,            // () => "off" | "launch" | "auto"
  isConnected,        // () => boolean
  getChangeMarker,    // () => number — changes whenever local data is written
  runSync,            // () => Promise<result> — one full pull + push
  onStatus = () => {},
  now = Date.now,
  setInterval: setIntervalFn = setInterval,
  clearInterval: clearIntervalFn = clearInterval,
}) {
  const startedAt = now();
  let timer = null;
  let inFlight = null;
  let baseline = null;       // marker right after the last sync
  let lastSeen = null;       // marker at the last tick
  let lastChangeAt = 0;
  let dirtySince = null;
  let lastSyncAt = startedAt; // launch sync covers start-up, so the first timed pull is a full interval away
  let failures = 0;
  let nextAllowedAt = 0;
  let needsLogin = false;
  let status = { state: "idle", at: null, error: null, needsLogin: false, retryAt: null, auto: false, mode: "off" };

  const publish = (patch) => {
    status = { ...status, ...patch };
    try { onStatus(status); } catch { /* a broken listener must not break syncing */ }
  };

  const marker = () => { try { return getChangeMarker(); } catch { return null; } };

  // The one place a sync happens. Concurrent callers (a click during a
  // background sync, the launch sync racing a tick) all get the same run.
  function syncNow({ auto = false } = {}) {
    if (inFlight) return inFlight;
    publish({ state: "syncing", error: null, retryAt: null, auto, mode: getMode() });
    inFlight = (async () => {
      try {
        const result = await runSync();
        failures = 0;
        needsLogin = false;
        nextAllowedAt = 0;
        baseline = marker();
        lastSeen = baseline;
        dirtySince = null;
        lastSyncAt = now();
        publish({ state: "ok", at: lastSyncAt, error: null, needsLogin: false, retryAt: null, result: summarise(result) });
        return result;
      } catch (err) {
        const message = (err && err.message) || String(err);
        failures += 1;
        needsLogin = NEEDS_LOGIN.test(message);
        nextAllowedAt = needsLogin ? Infinity : now() + RETRY_DELAYS_MS[Math.min(failures - 1, RETRY_DELAYS_MS.length - 1)];
        publish({ state: "error", error: message, needsLogin, retryAt: needsLogin ? null : nextAllowedAt, failedAt: now() });
        throw err;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  // Used by the Retry button / logging in again: forget the failure and go.
  function retryNow() {
    nextAllowedAt = 0;
    needsLogin = false;
    return syncNow({ auto: true }).catch(() => {});
  }

  function enabled() {
    return getMode() === "auto" && isConnected() && !inFlight && !needsLogin;
  }

  function tick() {
    if (!enabled()) return;
    const t = now();
    const m = marker();
    if (baseline === null) { baseline = m; lastSeen = m; }
    if (m !== lastSeen) {
      lastSeen = m;
      lastChangeAt = t;
      if (dirtySince === null && m !== baseline) dirtySince = t;
    }
    if (t < nextAllowedAt) return;
    const dirty = m !== baseline;
    const quiet = dirty && t - lastChangeAt >= QUIET_MS;
    const waitedTooLong = dirty && dirtySince !== null && t - dirtySince >= MAX_WAIT_MS;
    const pullDue = t - lastSyncAt >= PULL_INTERVAL_MS;
    if (quiet || waitedTooLong || pullDue) syncNow({ auto: true }).catch(() => {});
  }

  function notifyFocus() {
    if (!enabled()) return;
    const t = now();
    if (t < nextAllowedAt) return;
    if (t - lastSyncAt >= FOCUS_MIN_GAP_MS) syncNow({ auto: true }).catch(() => {});
  }

  function start() {
    if (timer) return;
    timer = setIntervalFn(tick, TICK_MS);
    if (timer && typeof timer.unref === "function") timer.unref();
  }

  function stop() {
    if (timer) clearIntervalFn(timer);
    timer = null;
  }

  return { start, stop, tick, notifyFocus, syncNow, retryNow, getStatus: () => status };
}

// Counts only, never row data, for the status line and the banner.
function summarise(result) {
  if (!result) return null;
  const pushed = result.pushed ? Object.values(result.pushed).reduce((a, b) => a + (Number(b) || 0), 0) : 0;
  const p = result.pulled || {};
  return { pushed, inserted: p.inserted || 0, updated: p.updated || 0, deleted: p.deleted || 0, coverArtFetched: p.coverArtFetched || 0 };
}

module.exports = {
  createAutoSync, summarise,
  QUIET_MS, MAX_WAIT_MS, PULL_INTERVAL_MS, FOCUS_MIN_GAP_MS, RETRY_DELAYS_MS, TICK_MS, NEEDS_LOGIN,
};
