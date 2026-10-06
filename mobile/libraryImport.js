// Bringing a Steam or GOG library into the phone: turning what the store returns into rows to
// review, with desktop's own choices (owned games in as In Progress and owned, wishlist
// games as Wishlist, a game in both lists only once as owned). Pure —
// test/mobileLibraryImport.test.js runs it without Expo.
import { findDuplicate } from "./duplicates";

// `source` is "steam" or "gog"; `library` = { owned, wishlist, wishlistError }; `mode` is
// "owned" | "wishlist" | "both". Returns { rows, wishlistError } — wishlistError is only reported
// when the wishlist was asked for.
export function gameRows(source, library, mode) {
  const rows = [];
  let wishlistError = null;
  const idOf = (g) => (source === "steam" ? String(g.appId) : `gog-${g.productId}`);
  const extra = (g) => (source === "steam"
    ? { steam_url: `https://store.steampowered.com/app/${g.appId}/` }
    : { year: g.year || null });

  if (mode === "owned" || mode === "both") {
    for (const g of library.owned || []) {
      if (!g.title) continue;
      rows.push({
        title: g.title, platform_id: idOf(g), status: "in-progress", owned: true,
        runtime: source === "steam" && g.playtime > 0 ? Math.round(g.playtime / 60) : null, ...extra(g),
      });
    }
  }
  if (mode === "wishlist" || mode === "both") {
    if (library.wishlistError) wishlistError = library.wishlistError;
    else {
      const ownedTitles = new Set((library.owned || []).map((g) => String(g.title).toLowerCase()));
      for (const g of library.wishlist || []) {
        if (!g.title || ownedTitles.has(String(g.title).toLowerCase())) continue;
        rows.push({ title: g.title, platform_id: idOf(g), status: "wishlist", owned: false, runtime: null, ...extra(g) });
      }
    }
  }
  return { rows, wishlistError };
}

// Marks rows already in the library (by store id, or title) and unticks them.
export function reviewGameRows(rows, library) {
  return rows.map((r, i) => {
    const duplicate = !!findDuplicate(library, { title: r.title, media_type: "Game", platform_id: r.platform_id, year: r.year });
    return { ...r, id: `g-${i}`, duplicate, selected: !duplicate };
  });
}

// The insert for one reviewed row.
export const quickRowFor = (r) => {
  const row = { title: r.title, status: r.status, platform_id: r.platform_id };
  if (r.runtime != null) row.runtime = r.runtime;
  if (r.year != null) row.year = r.year;
  if (r.steam_url) row.steam_url = r.steam_url;
  return row;
};
