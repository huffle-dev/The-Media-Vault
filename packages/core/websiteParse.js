// Reading a web page's own description of itself (Open Graph / schema.org / plain meta
// tags) for the Website media type, and refusing addresses that point inside the
// user's own network. Pure — no network, no Node or Electron — so desktop
// (services/website.js) and the phone (mobile/websiteInfo.js) share one copy and
// test/websiteParse.test.js covers it. No HTML parser: meta tags are pulled with bounded regexes.
const { decodeHtmlEntities } = require("./htmlText");

// This type fetches a fully user-supplied address, and then a second one (og:image)
// chosen by whatever page it just fetched, so both must be kept away from internal,
// loopback and link-local addresses (e.g. cloud metadata at 169.254.169.254).
function isPrivateAddress(ip) {
  if (ip === "0.0.0.0" || ip === "::") return true;
  if (ip.includes(":")) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true;
    if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true; // fe80::/10 link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 unique local
    const v4 = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped IPv6
    if (v4) return isPrivateAddress(v4[1]);
    return false;
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true; // malformed, treat as unsafe
  const [a, b] = parts;
  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 0) return true;
  return false;
}

// Without a DNS lookup (the phone has none to hand): is this host name itself an
// internal one? True for localhost, *.local / *.internal / *.localdomain, a bare name
// with no dot, and any IP literal that is private. A public name that DNS later points
// inside is only caught where a lookup is possible (desktop does that too).
function isInternalHostName(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (host === "localhost" || /\.(local|internal|localdomain|lan|home|corp)$/.test(host)) return true;
  if (host.includes(":") || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return isPrivateAddress(host);
  return !host.includes(".");
}

// Matches both attribute orders: <meta property="og:title" content="…"> and
// <meta content="…" property="og:title">.
function extractMeta(html, attr, key) {
  const re1 = new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]*content=["']([^"']*)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*${attr}=["']${key}["']`, "i");
  const m = html.match(re1) || html.match(re2);
  return m ? m[1].trim() : null;
}

// What the page says about itself. `pageUrl` is a URL object for the page (for the
// fallback title and site name). `ogImage` is returned as the page wrote it (it may be relative).
function parseWebsiteHtml(html, pageUrl) {
  const ogTitle = extractMeta(html, "property", "og:title");
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = ogTitle || (titleMatch ? titleMatch[1].trim() : pageUrl.hostname);
  const siteName = extractMeta(html, "property", "og:site_name") || pageUrl.hostname.replace(/^www\./, "");
  const description = extractMeta(html, "property", "og:description") || extractMeta(html, "name", "description");
  const author = extractMeta(html, "name", "author") || extractMeta(html, "property", "article:author");
  const publishedRaw = extractMeta(html, "property", "article:published_time") || extractMeta(html, "name", "date");
  const year = publishedRaw ? parseInt(publishedRaw.slice(0, 4), 10) || null : null;
  // Deprecated for SEO, but the only real source for this type's Tags field.
  const keywordsRaw = extractMeta(html, "name", "keywords");
  const tags = keywordsRaw ? keywordsRaw.split(",").map((k) => k.trim()).filter(Boolean).join(", ") || null : null;
  return {
    title: decodeHtmlEntities(title),
    site_name: decodeHtmlEntities(siteName),
    creator: author ? decodeHtmlEntities(author) : null,
    year,
    notes: description ? decodeHtmlEntities(description) : null,
    tags: tags ? decodeHtmlEntities(tags) : null,
    ogImage: extractMeta(html, "property", "og:image"),
  };
}

module.exports = { isPrivateAddress, isInternalHostName, extractMeta, parseWebsiteHtml };
