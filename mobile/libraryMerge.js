// Pure helpers for refreshing the phone's library list without downloading
// the whole thing again: ask Supabase only for rows changed since the newest
// `updated_at` already held, and fold them into the list. No React or Expo
// imports, so it can be unit-tested.

// Case-insensitive title order — the same order the list was first fetched in
// (`order("title")`), so a merged list reads the same as a full reload.
export const byTitle = (a, b) =>
  (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" });

// The newest `updated_at` in the list, as the ORIGINAL string (Postgres gives
// microseconds; going through Date would round it and the next ">=" filter
// could skip a row). null when nothing has one — e.g. a list cached before
// this column was fetched — which means "do a full reload instead".
export function latestUpdatedAt(items) {
  let best = null;
  let bestMs = -Infinity;
  for (const i of items || []) {
    if (!i.updated_at) continue;
    const ms = Date.parse(i.updated_at);
    if (Number.isFinite(ms) && ms > bestMs) { bestMs = ms; best = i.updated_at; }
  }
  return best;
}

// Folds changed rows into `current`: a row with `deleted_at` is removed, any
// other replaces (or adds) its sync_id. Safe to apply twice and with rows that
// were already merged, which matters because the fetch asks for
// "updated_at >= newest", so the newest row always comes back again.
export function mergeItemChanges(current, changes) {
  const bySyncId = new Map((current || []).map((i) => [i.sync_id, i]));
  let changed = 0;
  for (const c of changes || []) {
    if (!c || !c.sync_id) continue;
    if (c.deleted_at) {
      if (bySyncId.delete(c.sync_id)) changed++;
      continue;
    }
    const { deleted_at, ...row } = c; // eslint-disable-line no-unused-vars
    const prev = bySyncId.get(c.sync_id);
    if (!prev || prev.updated_at !== row.updated_at) changed++;
    bySyncId.set(c.sync_id, row);
  }
  return { items: [...bySyncId.values()].sort(byTitle), changed };
}
