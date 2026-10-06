// Shared GOG library sync orchestration — used by both the manual "Resync
// GOG Library" button (SettingsModal.jsx) and the auto-sync-on-launch flow
// (App.jsx), same pattern as steamSync.js. Pure orchestration over the
// existing window.vault.gog/items IPC calls — no React state here, callers
// own their own loading/result UI.
export async function runGogSync() {
  const { owned, wishlist, wishlistError } = await window.vault.gog.fetch();

  const ownedTitles = new Set(owned.map(g => g.title.toLowerCase()));
  const games = [
    ...owned.map(g => ({
      title: g.title, media_type: "Game",
      status: "in-progress", is_local: 1,
      year: g.year || null,
      // "gog-" prefix keeps these out of the Steam appid enrich pass
      // elsewhere — same media_type, different id source.
      platform_id: `gog-${g.productId}`,
    })),
    ...(wishlistError ? [] : wishlist)
      .filter(g => !ownedTitles.has(g.title.toLowerCase()))
      .map(g => ({
        title: g.title, media_type: "Game",
        status: "wishlist", is_local: 0,
        year: g.year || null,
        platform_id: `gog-${g.productId}`,
      })),
  ].filter(g => g.title);

  const res = await window.vault.items.import(games);

  // Background enrichment for GOG games — same fire-and-forget pattern
  // steamSync.js uses (see gog:enrich in main.js for why this needs its own
  // implementation rather than sharing Steam's).
  const gogIds = games.filter(g => g.platform_id).map(g => g.platform_id);
  if (gogIds.length) window.vault.gog.enrich(gogIds);

  return res;
}
