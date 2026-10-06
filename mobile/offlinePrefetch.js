// Saving the whole library for offline use: every item's full details (what an
// item profile shows), not just the profiles you happened to open. Pure — the
// Supabase client and the file writes are passed in — so
// test/mobileOfflinePrefetch.test.js can run it without Expo.

const CHUNK = 100; // sync_ids per ".in(...)" request (keeps the URL short)

// Items whose saved copy is missing or older than the list row. `manifest` is
// { sync_id: updated_at } for what has been saved so far.
export function itemsToPrefetch(items, manifest) {
  return (items || []).filter((i) => i.sync_id && (!manifest || manifest[i.sync_id] !== i.updated_at));
}

// Downloads and saves the given items' full rows. Resolves to
// { saved, failed, manifest }; never throws for one bad batch (the rest still
// go), and stops early when isCancelled() turns true.
export async function prefetchItems({ client, items, manifest = {}, save, onProgress = () => {}, isCancelled = () => false }) {
  const next = { ...manifest };
  let saved = 0, failed = 0;
  onProgress({ done: 0, total: items.length });
  for (let i = 0; i < items.length; i += CHUNK) {
    if (isCancelled()) break;
    const part = items.slice(i, i + CHUNK);
    try {
      const { data, error } = await client.from("items").select("*").in("sync_id", part.map((p) => p.sync_id));
      if (error) throw error;
      for (const row of data || []) { save(row); next[row.sync_id] = row.updated_at; saved++; }
      failed += part.length - (data || []).length;
    } catch {
      failed += part.length;
    }
    onProgress({ done: Math.min(i + CHUNK, items.length), total: items.length });
  }
  return { saved, failed, manifest: next };
}

// Names in `have` that aren't in `keep` — the saved files that no longer belong
// to anything in the library.
export function orphanNames(have, keep) {
  const wanted = new Set(keep);
  return (have || []).filter((name) => !wanted.has(name));
}

// Drops manifest entries for items that are gone.
export function pruneManifest(manifest, items) {
  const ids = new Set((items || []).map((i) => i.sync_id));
  return Object.fromEntries(Object.entries(manifest || {}).filter(([id]) => ids.has(id)));
}
