// Recognises IMDb / Steam / GOG pages from a tab's URL + title and returns
// what to pre-fill in the popup: { type, query, year, source } or null.
// Reads only the tab's title and URL (the "tabs" permission already granted) —
// no page scripts, no extra host permissions. Identical copy lives in
// browser-extension-firefox/; keep the two in sync.

function detectFromTab(tab) {
  let url;
  try { url = new URL(tab.url); } catch { return null; }
  const title = (tab.title || "").trim();
  if (!title) return null;
  const host = url.hostname.replace(/^www\./, "");

  if (host.endsWith("imdb.com") && /^\/title\/tt\d+/.test(url.pathname)) {
    // "Dune (2021) - IMDb", "Breaking Bad (TV Series 2008–2013) ⭐ 9.5 | Crime…"
    // Greedy so a name with its own parentheses still splits on the last
    // parenthetical that holds a year.
    const m = title.match(/^(.*\S)\s+\(([^()]*?\b(\d{4})\b[^()]*)\)/);
    if (m) {
      const kind = m[2].toLowerCase();
      if (kind.includes("episode")) return null;
      const type = kind.includes("video game") ? "Game"
        : kind.includes("tv series") || kind.includes("tv mini series") ? "TV"
        : "Movie";
      return { type, query: m[1], year: type === "Game" ? null : m[3], source: "IMDb" };
    }
    // Unreleased titles have no year in the tab title.
    const bare = title.match(/^(.*\S)\s*[-–—]\s*IMDb\s*$/i);
    if (bare) return { type: "Movie", query: bare[1], year: null, source: "IMDb" };
    return null;
  }

  if (host === "store.steampowered.com" && /^\/app\/\d+/.test(url.pathname)) {
    const query = title.replace(/^Save \d+% on /i, "").replace(/ on Steam$/i, "").trim();
    return query ? { type: "Game", query, year: null, source: "Steam" } : null;
  }

  if (host === "gog.com" && /\/game\//.test(url.pathname)) {
    const query = title.replace(/^Buy /i, "").replace(/\s+(on|-)\s+GOG\.com$/i, "").trim();
    return query ? { type: "Game", query, year: null, source: "GOG" } : null;
  }

  return null;
}

if (typeof module !== "undefined") module.exports = { detectFromTab };
