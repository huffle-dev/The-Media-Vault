// One-time-ish backfill of each library item's cover-art SOURCE URL
// (cover_art_sources), for the items whose art was downloaded before that
// table existed. Without it Cloud Sync has no cover_art_url to send, and the
// phone has to look every cover up through a source API itself — slow, and
// rate limits (Steam, TMDB, Audible) make a big library come up patchy.
//
// It re-runs the same per-source lookup the phone uses (packages/core/
// coverArtLookup.js) but against a storage that downloads nothing: it only
// checks the image URL exists (HEAD) and remembers it. `lookup` is that
// dispatcher; `captureStore` is an AsyncLocalStorage the capturing storage
// writes each URL into, so concurrent items can't mix theirs up.
//
// Skips art the user cropped by hand (cropped-*) — it's not the source
// image, so pointing other devices at the source URL would replace it.
const { fetchWithTimeout: fetch } = require("@media-vault/core/fetchWithTimeout");

const SKIP_NAME = /^cropped-/i;

// Resolves if the image URL answers (HEAD; 405 = HEAD unsupported, allowed),
// throws otherwise so a service falls back to its next candidate (e.g.
// Steam's portrait -> header).
async function verifyImageUrl(url, headers) {
  const res = await fetch(url, { method: "HEAD", headers: headers || { "User-Agent": "TheVault/1.0" } });
  if (!res.ok && res.status !== 405) throw new Error(`HTTP ${res.status}`);
}

// Some art files are named after the image they came from, so the source URL
// can be rebuilt without any lookup. Audiobooks imported from a Libation CSV
// are saved as `audible-<Amazon image id>.jpg` (main.js's audible:enrichCovers
// fetched `https://m.media-amazon.com/images/I/<id>.jpg`) — an Audible catalog
// lookup finds no image for most of those, which is why so few audiobooks got
// a link. A name that's a bare 10-character ASIN came from the catalog instead
// and is handled by the normal lookup.
function derivedSourceUrl(item) {
  const base = String(item.cover_art_path || "").split(/[\\/]/).pop();
  const m = /^audible-(.+)\.jpg$/i.exec(base);
  if (item.media_type === "Audiobook" && m && !/^[A-Z0-9]{10}$/.test(m[1])) {
    return `https://m.media-amazon.com/images/I/${m[1]}.jpg`;
  }
  return null;
}

function itemsMissingSource(db) {
  return db.db.prepare(`
    SELECT id, title, media_type, platform_id, cover_art_path
    FROM media_items
    WHERE cover_art_path IS NOT NULL AND cover_art_path != ''
      AND cover_art_path NOT IN (SELECT path FROM cover_art_sources)
  `).all().filter((i) => !SKIP_NAME.test(String(i.cover_art_path).split(/[\\/]/).pop()));
}

// onProgress({ done, total, recorded }) fires once up front and after each item.
// `skipPaths` (a Set of cover_art_path) leaves out items a recent run already failed
// to find a source for, and `onFailed(item)` reports each one that fails again —
// otherwise the same unfindable covers (a commercial, a game tutorial) would be
// looked up all over again after every sync, hammering TMDB/Steam/IGDB.
async function backfillCoverArtLinks(db, { lookup, captureStore, keys, concurrency = 4, delayMs = 150, onProgress, verify = verifyImageUrl, skipPaths = null, onFailed = null }) {
  const queue = itemsMissingSource(db).filter((i) => !(skipPaths && skipPaths.has(i.cover_art_path)));
  const total = queue.length;
  let recorded = 0;
  let done = 0;
  const report = () => { if (onProgress) { try { onProgress({ done, total, recorded }); } catch { /* progress is cosmetic */ } } };
  report();

  const worker = async () => {
    while (queue.length) {
      const item = queue.shift();
      try {
        const captured = { url: null };
        await captureStore.run(captured, () => lookup(item, keys));
        if (!captured.url) {
          const derived = derivedSourceUrl(item);
          if (derived) { await verify(derived); captured.url = derived; }
        }
        if (captured.url) { db.recordCoverArtSource(item.cover_art_path, captured.url); recorded++; }
        else if (onFailed) onFailed(item);
      } catch { if (onFailed) onFailed(item); /* leave it — the phone can still look it up itself */ }
      done++;
      report();
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
  return { total, recorded };
}

module.exports = { backfillCoverArtLinks, verifyImageUrl, itemsMissingSource, derivedSourceUrl };
