// The last-downloaded library list, kept on the phone so the app can still
// show it (read-only) with no connection. Only the lean list rows are
// cached — the same columns the Library grid queries.
import { Directory, File, Paths } from "expo-file-system";

const cacheFile = new File(Paths.document, "library-cache.json");

export function saveLibraryCache(items) {
  try {
    if (!cacheFile.exists) cacheFile.create();
    cacheFile.write(JSON.stringify({ savedAt: Date.now(), items }));
  } catch { /* the cache is best-effort — never break the live library over it */ }
}

// Full item rows, one file per item, saved whenever an item profile loads
// online — so an item you've opened before can be shown (read-only) offline.
const itemCacheDir = new Directory(Paths.document, "item_cache");

export function saveItemCache(item) {
  try {
    if (!itemCacheDir.exists) itemCacheDir.create({ intermediates: true });
    const file = new File(itemCacheDir, `${item.sync_id}.json`);
    if (!file.exists) file.create();
    file.write(JSON.stringify(item));
  } catch { /* best-effort */ }
}

export function deleteItemCache(syncId) {
  try {
    const file = new File(itemCacheDir, `${syncId}.json`);
    if (file.exists) file.delete();
  } catch { /* nothing to remove */ }
}

export async function loadItemCache(syncId) {
  try {
    const file = new File(itemCacheDir, `${syncId}.json`);
    return file.exists ? JSON.parse(await file.text()) : null;
  } catch {
    return null;
  }
}

// Which saved copy is how fresh: { sync_id: updated_at }, written by the offline
// prefetch (Settings -> Offline use) so the next run only fetches what changed.
const manifestFile = new File(Paths.document, "item-cache-manifest.json");
export async function loadItemManifest() {
  try { return manifestFile.exists ? JSON.parse(await manifestFile.text()) : {}; } catch { return {}; }
}
export function saveItemManifest(manifest) {
  try {
    if (!manifestFile.exists) manifestFile.create();
    manifestFile.write(JSON.stringify(manifest));
  } catch { /* best-effort */ }
}

// Deletes saved item files whose item is no longer in the library; returns how many.
export function removeOrphanItemFiles(orphanFileNames) {
  let n = 0;
  for (const name of orphanFileNames) {
    try { const f = new File(itemCacheDir, name); if (f.exists) { f.delete(); n++; } } catch { /* skip */ }
  }
  return n;
}
export function listItemCacheFiles() {
  try { return itemCacheDir.exists ? itemCacheDir.list().map((e) => e.name) : []; } catch { return []; }
}

export function clearLibraryCache() {
  try { if (cacheFile.exists) cacheFile.delete(); } catch { /* nothing to clear */ }
  try { if (itemCacheDir.exists) itemCacheDir.delete(); } catch { /* nothing to clear */ }
  try { if (manifestFile.exists) manifestFile.delete(); } catch { /* nothing to clear */ }
}

export async function loadLibraryCache() {
  try {
    if (!cacheFile.exists) return null;
    const parsed = JSON.parse(await cacheFile.text());
    return Array.isArray(parsed.items) ? parsed : null;
  } catch {
    return null;
  }
}
