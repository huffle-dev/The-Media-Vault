// Board Game search and details on the phone: BoardGameGeek's own pages and endpoints, fetched
// through the hidden web view (bggBridge.js / BggHost.js) and read with the shared
// packages/core/bggParse.js.
import { bggFetch } from "./bggBridge";
import { parseBggSearchHtml, buildBggDetails } from "@media-vault/core/bggParse.js";

export async function bggSearch(query, fetchPage = bggFetch) {
  let html;
  try {
    html = await fetchPage(`https://boardgamegeek.com/geeksearch.php?action=search&objecttype=boardgame&q=${encodeURIComponent(query)}&B1=Go`, "text");
  } catch (e) {
    throw new Error(`BGG search failed (${(e && e.message) || "network error"}). Try again in a moment.`);
  }
  return parseBggSearchHtml(html);
}

export async function bggDetails(bggId, mediaType = "Board Game", fetchPage = bggFetch) {
  const id = encodeURIComponent(bggId);
  const [detail, stats] = await Promise.all([
    fetchPage(`https://api.geekdo.com/api/geekitems?objecttype=thing&objectid=${id}&nosession=1`, "json"),
    fetchPage(`https://api.geekdo.com/api/dynamicinfo?objecttype=thing&objectid=${id}&nosession=1`, "json").catch(() => null),
  ]);
  return buildBggDetails(detail, stats, bggId, mediaType);
}
