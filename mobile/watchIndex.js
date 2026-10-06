// "Where to stream" as a Library filter. Each film or show carries every country's
// providers in one big column (watch_providers); downloading that for the whole library
// every time would be heavy, so the phone downloads it once per country, keeps only that
// country's short lists, and remembers the result. Pure parts here (tested in
// test/mobileWatchIndex.test.js); the download is loadWatchIndex.

export const PROVIDER_TYPES = [
  ["flatrate", "Stream"], ["free", "Free"], ["rent", "Rent"], ["buy", "Buy"],
];
export const DEFAULT_PROVIDER_TYPES = ["flatrate", "free"];

// One item's providers for one country: { flatrate, free, rent, buy } (arrays), or null
// when it has none recorded (never checked, or damaged).
export function sliceForRegion(watchProviders, region) {
  if (!watchProviders) return null;
  try {
    const all = typeof watchProviders === "string" ? JSON.parse(watchProviders) : watchProviders;
    const r = all && all[region];
    if (!r) return { flatrate: [], free: [], rent: [], buy: [] };
    return { flatrate: r.flatrate || [], free: r.free || [], rent: r.rent || [], buy: r.buy || [] };
  } catch {
    return null;
  }
}

// rows: [{ sync_id, watch_providers }] -> Map(sync_id -> slice). Items with nothing recorded are left out.
export function buildIndex(rows, region) {
  const index = new Map();
  for (const row of rows) {
    const slice = sliceForRegion(row.watch_providers, region);
    if (slice) index.set(row.sync_id, slice);
  }
  return index;
}

// Providers to choose from for the chosen kinds of availability, most titles first.
export function providerChoices(index, types) {
  const counts = new Map();
  for (const slice of index.values()) {
    const names = new Set(types.flatMap((t) => slice[t] || []));
    for (const name of names) counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// Items on `provider` in any of the chosen kinds. No provider chosen = everything.
export function filterByProvider(items, index, provider, types) {
  if (!provider) return items;
  return items.filter((i) => {
    const slice = index && index.get(i.sync_id);
    return !!slice && types.some((t) => (slice[t] || []).includes(provider));
  });
}

// Downloads the providers of every Movie and TV item, page by page, and builds the index.
// `onProgress({ done })` fires per page. Throws on a server error.
export async function loadWatchIndex(client, region, { onProgress = () => {} } = {}) {
  const PAGE = 300;
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from("items").select("sync_id, watch_providers")
      .in("media_type", ["Movie", "TV"]).is("deleted_at", null).not("watch_providers", "is", null)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...data);
    onProgress({ done: rows.length });
    if (data.length < PAGE) break;
  }
  return buildIndex(rows, region);
}

// The index kept between visits (per country), as plain JSON; null if missing or damaged.
const KEY = (region) => `mobile_watch_index_${region}`;
export function readIndexCache(region, store = localStorage) {
  try {
    const saved = JSON.parse(store.getItem(KEY(region)) || "null");
    if (!saved || !Array.isArray(saved.entries)) return null;
    return { index: new Map(saved.entries), builtAt: saved.builtAt || 0 };
  } catch {
    return null;
  }
}
export function writeIndexCache(region, index, builtAt = Date.now(), store = localStorage) {
  try { store.setItem(KEY(region), JSON.stringify({ builtAt, entries: [...index.entries()] })); } catch { /* best-effort */ }
}
