// Add a Website from its address (desktop's Website type): fetch that one page and read
// its own title, description, author, date and picture. Page reading is the shared
// packages/core/websiteParse.js; the address checks and the item shape are here. The
// pure parts are tested in test/mobileWebsiteInfo.test.js.
import { isInternalHostName, parseWebsiteHtml } from "@media-vault/core/websiteParse";
import { fetchWithTimeout } from "@media-vault/core/fetchWithTimeout";

// "example.com/post" / "https://example.com/post" -> a public http(s) URL, or throws.
export function normaliseWebsiteUrl(input) {
  let raw = String(input || "").trim();
  if (!raw) throw new Error("Paste the address of a web page.");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;
  let url;
  try { url = new URL(raw); } catch { throw new Error("That doesn't look like a web address."); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http and https addresses are supported.");
  if (isInternalHostName(url.hostname)) throw new Error("That address can't be fetched.");
  return url;
}

// The picture: the page's og:image (resolved against the page, and checked the same way as
// the page itself), else Google's free favicon service for the site.
export function websiteCoverUrl(ogImage, pageUrl) {
  if (ogImage) {
    try {
      const u = new URL(ogImage, pageUrl.href);
      if ((u.protocol === "http:" || u.protocol === "https:") && !isInternalHostName(u.hostname)) return u.href;
    } catch { /* fall through to the favicon */ }
  }
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(pageUrl.hostname)}&sz=128`;
}

// Page HTML -> an item-shaped object ready to save.
export function buildWebsiteItem(html, pageUrl, today = new Date().toISOString().split("T")[0]) {
  const info = parseWebsiteHtml(html, pageUrl);
  return {
    title: info.title, media_type: "Website", site_name: info.site_name, creator: info.creator, year: info.year,
    url: pageUrl.href, notes: info.notes, tags: info.tags,
    cover_art_url: websiteCoverUrl(info.ogImage, pageUrl), metadata_checked_date: today,
  };
}

export async function fetchWebsiteInfo(input, doFetch = fetchWithTimeout) {
  const url = normaliseWebsiteUrl(input);
  const res = await doFetch(url.href, { headers: { "User-Agent": "Mozilla/5.0 (compatible; TheVault/1.0)" } });
  if (!res.ok) throw new Error(`Couldn't fetch that page (HTTP ${res.status}).`);
  return buildWebsiteItem(await res.text(), url);
}
