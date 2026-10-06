// Website (Open Graph / schema.org) integration. No "search" — the URL is
// already known, so this fetches that one page and reads its own metadata.
// No HTML parser dependency; meta tags are pulled with bounded regexes.

const path = require("path");
const fs = require("fs");
const dns = require("dns").promises;
const { downloadImage } = require("../lib/downloadImage");
const { coverArtDir } = require("../lib/appPaths");
const { slugify } = require("@media-vault/core/format");
const { isPrivateAddress, parseWebsiteHtml } = require("@media-vault/core/websiteParse");
const { fetchWithTimeout: fetch } = require("@media-vault/core/fetchWithTimeout");

async function assertPublicHttpUrl(rawUrl, base) {
  let url;
  try { url = new URL(rawUrl, base); } catch { throw new Error("That doesn't look like a valid URL."); }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http/https URLs are supported.");
  }
  const addresses = await dns.lookup(url.hostname, { all: true }).catch(() => []);
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new Error("That URL can't be fetched.");
  }
  return url;
}

async function fetchWebsiteInfo(rawUrl) {
  const url = await assertPublicHttpUrl(rawUrl);

  const res = await fetch(url.href, { headers: { "User-Agent": "Mozilla/5.0 (compatible; TheVault/1.0)" } });
  if (!res.ok) throw new Error(`Couldn't fetch that page (HTTP ${res.status}).`);
  const html = await res.text();

  const { title, site_name: siteName, creator, year, notes, tags, ogImage } = parseWebsiteHtml(html, url);

  let cover_art_path = null;
  if (ogImage) {
    try {
      // og:image is sometimes a relative path, but it's chosen by whatever
      // page we just fetched — validate it the same way as the page URL
      // itself rather than trusting it just because it's "relative".
      const imageUrl = (await assertPublicHttpUrl(ogImage, url.href)).href;
      const ext = (imageUrl.split(".").pop().split("?")[0] || "jpg").toLowerCase().slice(0, 4);
      const destPath = path.join(coverArtDir(), `website-${slugify(siteName)}-${slugify(title).slice(0, 40)}.${ext}`);
      if (!fs.existsSync(destPath)) await downloadImage(imageUrl, destPath);
      cover_art_path = destPath;
    } catch { /* falls through to the favicon fallback below */ }
  }
  // Fallback for no og:image — Google's free favicon service resolves a
  // real favicon for virtually any domain, no <link rel="icon"> parsing needed.
  if (!cover_art_path) {
    try {
      const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url.hostname)}&sz=128`;
      const destPath = path.join(coverArtDir(), `website-favicon-${slugify(siteName)}.png`);
      if (!fs.existsSync(destPath)) await downloadImage(faviconUrl, destPath);
      cover_art_path = destPath;
    } catch { /* falls back to no art */ }
  }

  return {
    title,
    media_type:    "Website",
    site_name:     siteName,
    creator,
    year,
    url:           url.href,
    notes,
    tags,
    cover_art_path,
    metadata_checked_date: new Date().toISOString().split("T")[0],
  };
}

module.exports = { fetchWebsiteInfo };
