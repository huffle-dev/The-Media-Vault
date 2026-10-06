// Shared Steam library sync orchestration — used by both the manual
// "Resync Steam Library" button (SettingsModal.jsx) and the auto-update-on-
// launch flow (App.jsx), so the owned/wishlist-mapping logic only lives in
// one place. Pure orchestration over the existing window.vault.steam/items
// IPC calls — no React state here, callers own their own loading/result UI.
export async function runSteamSync({ steamId, apiKey }) {
  const { owned, wishlist } = await window.vault.steam.fetch({ steamId, apiKey });

  const ownedTitles = new Set(owned.map(g => g.title.toLowerCase()));
  const games = [
    ...owned.map(g => ({
      title: g.title, media_type: "Game",
      status: "in-progress",
      runtime: g.playtime > 0 ? Math.round(g.playtime / 60) : null,
      is_local: 1, platform_id: String(g.appId),
      steam_url: `https://store.steampowered.com/app/${g.appId}/`,
    })),
    ...wishlist
      .filter(g => !ownedTitles.has(g.title.toLowerCase()))
      .map(g => ({ title: g.title, media_type: "Game", status: "wishlist", is_local: 0, platform_id: String(g.appId), steam_url: `https://store.steampowered.com/app/${g.appId}/` })),
  ].filter(g => g.title);

  const res = await window.vault.items.import(games);

  // Background enrichment for Steam games
  const steamIds = games.filter(g => g.platform_id).map(g => g.platform_id);
  if (steamIds.length) window.vault.steam.enrich(steamIds);

  return res;
}
