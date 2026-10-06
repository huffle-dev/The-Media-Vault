// Working out what a page shared to the app from another app (IMDb, Steam,
// Audible, Goodreads, YouTube...) is, so Add can open with it already searched.
// Pure — test/mobileShareParse.test.js runs it without Expo. Like desktop's
// browser-extension detect.js, it reads only the link and the shared text.

const URL_IN_TEXT = /https?:\/\/\S+/i;

const titleCase = (slug) =>
  decodeURIComponent(slug).replace(/[-_+]+/g, " ").replace(/\s+/g, " ").trim();

// The first line of the shared text that is a title rather than a link.
function titleLine(text) {
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.replace(URL_IN_TEXT, "").trim();
    if (line) return line;
  }
  return "";
}

// "Dune (2021)" / "Dune - IMDb" / "Check out Hades on Steam" -> "Dune" / "Hades".
const cleanTitle = (t) => t
  .replace(/^check out\s+/i, "")
  .replace(/\s+on steam\s*$/i, "")
  .replace(/\s*[-–—|]\s*(imdb|goodreads|audible[^-]*)\s*$/i, "")
  .replace(/\s*\((?:[^()]*\b\d{4}\b[^()]*)\)\s*$/, "")
  .replace(/^["“]|["”]$/g, "")
  .trim();

const yearOf = (t) => {
  const m = /\(([^()]*?\b(\d{4})\b[^()]*)\)\s*$/.exec(t);
  return m ? m[2] : null;
};

// -> { mediaType, query, year?, source } or null when it is not something we know.
export function parseShared({ text, webUrl, title } = {}) {
  const urlText = webUrl || (URL_IN_TEXT.exec(String(text || "")) || [])[0];
  if (!urlText) return null;
  let url;
  try { url = new URL(urlText.replace(/[).,;]+$/, "")); } catch { return null; }
  const host = url.hostname.replace(/^(www|m)\./, "");
  const path = url.pathname;
  const line = titleLine(text) || String(title || "").trim();

  if (host.endsWith("imdb.com") && /^\/title\/tt\d+/.test(path)) {
    const lower = `${line} ${title || ""}`.toLowerCase();
    const mediaType = lower.includes("video game") ? "Game" : /tv (mini )?series/.test(lower) ? "TV" : "Movie";
    const query = cleanTitle(line);
    return query ? { mediaType, query, year: mediaType === "Game" ? null : yearOf(line), source: "IMDb" } : null;
  }

  if (host === "store.steampowered.com" && /^\/app\/\d+/.test(path)) {
    const slug = path.split("/")[3];
    const query = cleanTitle(line) || (slug ? titleCase(slug) : "");
    return query ? { mediaType: "Game", query, year: null, source: "Steam" } : null;
  }

  if (host === "gog.com" && /\/game\//.test(path)) {
    const query = cleanTitle(line) || titleCase(path.split("/game/")[1].split("/")[0]);
    return query ? { mediaType: "Game", query, year: null, source: "GOG" } : null;
  }

  if (/^audible\.[a-z.]+$/.test(host) && /^\/pd\//.test(path)) {
    const slug = path.split("/")[2];
    const query = cleanTitle(line) || (slug ? titleCase(slug) : "");
    return query ? { mediaType: "Audiobook", query, year: null, source: "Audible" } : null;
  }

  if (host === "goodreads.com" && /^\/book\/show\//.test(path)) {
    const fromText = cleanTitle(line).split(/\s+by\s+/i)[0].trim();
    const slug = path.split("/")[3] || "";
    const query = fromText || titleCase(slug.replace(/^\d+[-.]?/, ""));
    return query ? { mediaType: "Book", query, year: null, source: "Goodreads" } : null;
  }

  if (host === "youtube.com" || host === "youtu.be" || host === "music.youtube.com") {
    // Add's Web Video search already turns a pasted link into that channel, video or playlist.
    return { mediaType: "Web Video", query: url.toString(), year: null, source: "YouTube" };
  }

  if (host === "discogs.com") {
    const slug = (path.match(/\/(?:release|master)\/\d+-?(.*)$/) || [])[1];
    const query = cleanTitle(line) || (slug ? titleCase(slug) : "");
    return query ? { mediaType: "Music", query, year: null, source: "Discogs" } : null;
  }

  return null;
}
