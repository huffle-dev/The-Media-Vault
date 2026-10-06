// Real cover-art storage for mobile, implementing the same `storage`
// interface packages/core/*.js's createXService(storage) factories expect
// (coverArtDir/downloadImage/fileExists/joinPath) — see movie.js's own
// header comment for why that interface exists at all. Desktop passes
// Node's fs/path; this passes Expo's File/Directory API (SDK 57's
// class-based rewrite — the older FileSystem.* function API is deprecated
// and throws at runtime unless imported from "expo-file-system/legacy",
// per the SDK 57 docs).
//
// Files live in the app's own document directory (Paths.document — safe
// from the OS reclaiming space under pressure, unlike Paths.cache), one
// flat folder keyed by a caller-chosen filename (the same
// "<source>-<platformId>.jpg" scheme desktop already uses per service).
import { Directory, File, Paths } from "expo-file-system";
import { looksLikeImage } from "./imageBytes";

const coverArtDirectory = new Directory(Paths.document, "cover_art");

function ensureDir() {
  // Directory/File construction never touches disk on its own (per the SDK
  // docs) — only an actual read/write op needs the folder to really exist,
  // so this is called right before every download rather than once at
  // module load.
  if (!coverArtDirectory.exists) coverArtDirectory.create({ intermediates: true });
}

// Some image CDNs (e.g. Discogs) reject a generic/default HTTP-library
// User-Agent, so every download identifies itself unless the caller passes
// its own headers — harmless for hosts that don't care.
const DEFAULT_HEADERS = { "User-Agent": "TheVault/1.0" };

// local file uri -> the remote URL it was downloaded from, for this app
// session. Search & Add reads it to save items.cover_art_url with a new
// item, so other devices (and this one, later) can download straight from
// the link instead of repeating the source-API lookup.
const sourceByUri = new Map();
export const getCoverArtSourceUrl = (uri) => sourceByUri.get(uri) || null;

// `url` here always comes from synced data (items.cover_art_url) or a
// search result from a metadata API — never something the user typed
// directly — but it still shouldn't be handed to the native download task
// unchecked: a crafted http(s) URL pointing at an internal host is the
// phone's problem to not fetch, same reasoning as the desktop SSRF fix in
// services/website.js (lower stakes here since there's no DNS-based
// private-range check, but at least file://, content:// etc. are refused).
function assertFetchableUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error("Invalid cover art URL."); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http/https cover art URLs are supported.");
  }
  return url;
}

// One download per file at a time: several tiles and the profile can ask for the same cover together, and
// they must share one download rather than each writing (or reading) the same half-finished file.
const inflight = new Map();
function download(url, uri, headers) {
  const running = inflight.get(uri);
  if (running) return running;
  const started = downloadToFile(url, uri, headers).finally(() => inflight.delete(uri));
  inflight.set(uri, started);
  return started;
}

// Downloads to "<name>.part", checks it is really a picture, then moves it into place in one step, so a file
// at its final name is always complete. (Before this, a tile could find the file half-written, fail to draw it,
// and a repair then deleted it from under the download that was still writing it.)
async function downloadToFile(url, uri, headers) {
  assertFetchableUrl(url);
  ensureDir();
  const finalFile = new File(uri);
  const part = new File(`${uri}.part`);
  try { if (part.exists) part.delete(); } catch { /* nothing to clear */ }
  await File.createDownloadTask(url, part, { headers: headers || DEFAULT_HEADERS }).downloadAsync();
  // A "successful" download can still be an error page or nothing at all: never keep that as a cover.
  // Only a file we could read and positively saw is not a picture is removed; if the file can't be read at
  // all we leave it be rather than risk throwing good covers away.
  let bytes = null;
  try { bytes = new Uint8Array(await part.arrayBuffer()); } catch { bytes = null; }
  if (bytes && !(bytes.length > 100 && looksLikeImage(bytes))) {
    try { part.delete(); } catch { /* nothing to remove */ }
    throw new Error("The download was not a picture");
  }
  // Put it in place. Move is one step; if it is not available, copy; as a last resort write the bytes we read.
  try { if (finalFile.exists) finalFile.delete(); } catch { /* ignore */ }
  try {
    part.move(finalFile);
  } catch {
    try {
      part.copy(finalFile);
      try { part.delete(); } catch { /* leave it */ }
    } catch {
      if (!bytes) throw new Error("Could not save the cover");
      finalFile.create();
      finalFile.write(bytes);
      try { part.delete(); } catch { /* leave it */ }
    }
  }
}

// Small stable hash so a URL maps to one filename (djb2) — files fetched
// straight from an items.cover_art_url aren't named by source id. Two
// independent 32-bit hashes combined (not one) — a single 32-bit hash has a
// real collision chance by the time a library reaches a couple thousand
// items (birthday bound ~sqrt(2^32)), and a collision here isn't harmless:
// it silently overwrites a different item's cached cover with this one's.
// Combining two pushes the bound out to ~sqrt(2^64), negligible at any
// library size this app will see. Stays synchronous on purpose — Expo's
// real crypto hash (expo-crypto) is async, and this needs to work in
// peekCachedCoverArtUri's sync existence check too.
function hashUrl(url) {
  let h1 = 5381, h2 = 52711;
  for (let i = 0; i < url.length; i++) {
    const c = url.charCodeAt(i);
    h1 = ((h1 * 33) ^ c) >>> 0;
    h2 = ((h2 * 31) ^ c) >>> 0;
  }
  return h1.toString(36) + h2.toString(36);
}

// Desktop stores TMDB posters at 780px wide; a phone tile is ~120-180dp
// (roughly 360-540px), so fetch the 342px rendition — about a fifth of the
// bytes, which is what makes a whole library fill in quickly.
function destForUrl(url) {
  const fetchUrl = url.replace("/t/p/w780/", "/t/p/w342/");
  return { fetchUrl, uri: new File(coverArtDirectory, `url-${hashUrl(fetchUrl)}.jpg`).uri };
}

// Synchronous cache-hit check (File.exists doesn't touch the network) so a
// caller can skip the download lane entirely for an already-cached item,
// rather than taking up one of its slots just to find out there's nothing
// to download — the lane has real value for an actual fetch, not for a
// scroll through tiles whose covers already landed on a previous pass.
// Returns the uri if cached, otherwise null.
export function peekCachedCoverArtUri(url) {
  const { uri } = destForUrl(url);
  const file = new File(uri);
  if (!file.exists) return null;
  if (typeof file.size === "number" && file.size === 0) { try { file.delete(); } catch { /* ignore */ } return null; } // empty: not a real cover
  sourceByUri.set(uri, url);
  return uri;
}

// Reads a saved cover and checks it is a whole picture; deletes it if not so it gets downloaded again.
// (Covers saved by older builds could be cut short, and a cut-short file looks "already saved".)
// If the file can't be read at all it is left alone. Returns true when a good file is there.
export async function verifyCachedCover(url) {
  const { uri } = destForUrl(url);
  const file = new File(uri);
  if (!file.exists) return false;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > 100 && looksLikeImage(bytes)) return true;
    file.delete();
    return false;
  } catch { return true; }
}

// Downloads (if not already cached) the image at an items.cover_art_url and
// returns its local file:// uri. Throws on download failure.
export async function cacheCoverArtFromUrl(url) {
  const { fetchUrl, uri } = destForUrl(url);
  ensureDir();
  if (!peekCachedCoverArtUri(url)) await download(fetchUrl, uri);
  sourceByUri.set(uri, url);
  return uri;
}

// Cover-folder housekeeping: files downloaded straight from a synced link are
// named url-<hash>.jpg, so the ones no item points at any more can be deleted.
// (Files named by source id belong to lookups with no stored link, so they stay.)
export function coverFileNameForUrl(url) {
  return new File(destForUrl(url).uri).name;
}
export function listLinkedCoverFiles() {
  try {
    return coverArtDirectory.exists
      ? coverArtDirectory.list().filter((e) => e.name.startsWith("url-")).map((e) => e.name)
      : [];
  } catch { return []; }
}
export function deleteCoverFiles(names) {
  let n = 0;
  for (const name of names) {
    try { const f = new File(coverArtDirectory, name); if (f.exists) { f.delete(); n++; } } catch { /* skip */ }
  }
  return n;
}

// `joinPath`'s two arguments are always (storage.coverArtDir(), filename)
// in every caller — coverArtDir() itself is unused here (there's nothing
// meaningful to return that isn't just the Directory instance above), so
// this is where the actual File is built and its usable `file://` URI
// returned as the "path" string every other storage method, and the
// caller's own cover_art_path field, then works with.
export const mobileCoverArtStorage = {
  coverArtDir: () => "",
  joinPath: (_dir, filename) => {
    ensureDir();
    return new File(coverArtDirectory, filename).uri;
  },
  fileExists: (uri) => new File(uri).exists,
  downloadImage: async (url, uri, headers) => {
    await download(url, uri, headers);
    sourceByUri.set(uri, url);
  },
  ensureImage: async (url, uri, headers) => {
    if (!new File(uri).exists) await download(url, uri, headers);
    sourceByUri.set(uri, url);
  },
};
