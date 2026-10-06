// Parses/validates a vault:// deep-link URL (from the OS protocol handler or
// the companion browser extension) into a safe, normalized action — fails
// closed on anything malformed or unrecognized, same spirit as the
// shell:openPath validation in main.js.

const SUPPORTED_DEEPLINK_TYPES = ["Game", "Board Game", "Movie", "TV", "Web Video", "Podcast", "Book", "Audiobook", "Music"];
// Kept as its own array rather than imported from SearchModal.jsx (a .jsx
// file shouldn't be required from main.js) — mirror SearchModal.jsx's
// SUPPORTED_TYPES if either list changes.

function parseDeepLink(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "vault:") return null;

  // vault://search?... parses "search" as hostname; vault:search?... (no
  // slashes) would put it in pathname instead — accept both forms.
  const action = parsed.hostname || parsed.pathname.replace(/^\/+/, "");
  if (action !== "search") return null;

  const mediaType = parsed.searchParams.get("type");
  if (!mediaType || !SUPPORTED_DEEPLINK_TYPES.includes(mediaType)) return null;

  const query = (parsed.searchParams.get("q") || "").trim().slice(0, 500);
  if (!query) return null;

  // Optional release year (Movie/TV disambiguation) — silently dropped, not
  // rejected, when malformed, since the search still works without it.
  const yearRaw = parsed.searchParams.get("year");
  const year = yearRaw && /^\d{4}$/.test(yearRaw) && +yearRaw >= 1870 && +yearRaw <= 2100 ? yearRaw : null;

  return { action: "search", mediaType, query, ...(year && { year }) };
}

module.exports = { parseDeepLink, SUPPORTED_DEEPLINK_TYPES };
