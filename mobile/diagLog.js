// A small record of what has gone wrong in the app, for Settings -> Problems & logs. Errors that
// would otherwise be swallowed (a cover that would not load, a refresh that failed, an uncaught
// error) are written here with the time and the reason, kept in memory and on the phone, so
// they can be read or sent to me later. Pure — the clock, the storage and the timer are passed
// in — so test/mobileDiagLog.test.js runs without Expo.

const clip = (value, n) => {
  const text = value == null ? "" : String(value);
  return text.length > n ? `${text.slice(0, n)}…` : text;
};

export function createLog({ max = 300, now = () => Date.now(), store = null, key = "mobile_diag_log", setTimer = setTimeout } = {}) {
  let entries = [];
  const listeners = new Set();
  let pending = null;

  try {
    const saved = store && JSON.parse(store.getItem(key) || "[]");
    if (Array.isArray(saved)) entries = saved.slice(-max);
  } catch { /* a damaged log is just an empty one */ }

  const save = () => { try { if (store) store.setItem(key, JSON.stringify(entries)); } catch { /* best-effort */ } pending = null; };
  const schedule = () => { if (!pending) pending = setTimer(save, 500); };
  const notify = () => listeners.forEach((fn) => fn());

  return {
    // level: "fatal" | "error" | "warn" | "info". The same message repeating just counts up.
    add(level, source, message, detail) {
      const msg = clip(message, 400);
      const last = entries[entries.length - 1];
      if (last && last.level === level && last.source === source && last.message === msg) {
        last.count = (last.count || 1) + 1;
        last.t = now();
      } else {
        entries.push({ t: now(), level, source, message: msg, detail: clip(detail, 1500), count: 1 });
        if (entries.length > max) entries = entries.slice(-max);
      }
      // A crash may be the last thing the app does: write it now, not after a delay.
      if (level === "fatal") save(); else schedule();
      notify();
    },
    entries: () => entries.slice(),
    clear() { entries = []; save(); notify(); },
    flush: save,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    // How many problems (warn and worse) since `since` (ms), and how many of those are errors.
    counts(since = 0) {
      const recent = entries.filter((e) => e.t > since);
      return {
        problems: recent.filter((e) => e.level !== "info").length,
        errors: recent.filter((e) => e.level === "error" || e.level === "fatal").length,
        fatal: recent.filter((e) => e.level === "fatal").length,
      };
    },
    // The whole log as text to send: newest first, with a header saying which build it came from.
    toText(header = "") {
      const lines = [header, ""].filter((l, i) => l || i);
      for (const e of entries.slice().reverse()) {
        lines.push(`${new Date(e.t).toISOString()} [${e.level.toUpperCase()}] ${e.source}: ${e.message}${e.count > 1 ? ` (x${e.count})` : ""}`);
        if (e.detail) lines.push(`    ${e.detail.replace(/\n/g, "\n    ")}`);
      }
      return lines.join("\n");
    },
  };
}

// A plain-words count of how the library's covers stand, for the diagnostics screen: for each type,
// how many items have a synced cover link and how many do not.
export function coverSummary(items) {
  const byType = new Map();
  for (const i of items || []) {
    const row = byType.get(i.media_type) || { type: i.media_type, total: 0, linked: 0 };
    row.total++;
    if (i.cover_art_url) row.linked++;
    byType.set(i.media_type, row);
  }
  return [...byType.values()].sort((a, b) => b.total - a.total).map((r) => ({ ...r, missing: r.total - r.linked }));
}
