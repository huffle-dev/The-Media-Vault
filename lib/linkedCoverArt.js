// After a Cloud Sync pull: for each pulled item whose cloud row carries a
// cover_art_url, download this device's own copy straight from that link —
// but only if the item has no working local art already, so the (cheaper,
// more accurate) link is used *instead of* a source-API lookup for items
// that arrived from another device. Online search never comes through here.
//
// One exception: if the item HAS local art and the cloud now carries a picture the PHONE
// uploaded (a replacement cover; see isPhoneUploadedCover), the new picture replaces it.
// Any other difference in links is ignored, so a different-sized copy of the same poster
// never swaps art around, and art with no recorded link (a crop made here) is left alone.
//
// cover_art_path is device-local and never synced, so it's written with raw
// SQL that leaves updated_at alone — bumping it would make this device
// re-push a row that hasn't actually changed.
const crypto = require("crypto");

const LINK_HEADERS = { "User-Agent": "TheVault/1.0" };
const CONCURRENCY = 5;

// The phone names its uploads <user id>/<item id>-<time>.jpg in the covers bucket;
// desktop's own thumbnail uploads are <item id>.jpg with no time part.
const PHONE_COVER = /\/covers\/[^/]+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-\d+\.jpg(\?|$)/i;
const isPhoneUploadedCover = (url) => PHONE_COVER.test(String(url || ""));

async function downloadLinkedCoverArt(db, links, { ensureImage, coverArtDir, fs, path }) {
  const queue = links.filter(l => l && l.sync_id && l.url);
  let fetched = 0;

  const worker = async () => {
    while (queue.length) {
      const { sync_id, url } = queue.shift();
      try {
        const row = db.db.prepare(`SELECT id, cover_art_path FROM media_items WHERE sync_id = ?`).get(sync_id);
        if (!row) continue;
        const dest = path.join(coverArtDir(), `synced-${crypto.createHash("sha1").update(url).digest("hex").slice(0, 16)}.jpg`);
        if (row.cover_art_path && fs.existsSync(row.cover_art_path)) {
          // Keep it unless we know it came from a DIFFERENT link than the cloud's now carries.
          const known = db.db.prepare(`SELECT url FROM cover_art_sources WHERE path = ?`).get(row.cover_art_path);
          const cameFromALink = path.basename(row.cover_art_path).startsWith("synced-");
          const same = known ? known.url === url : path.basename(row.cover_art_path) === path.basename(dest);
          if (same || (!known && !cameFromALink) || !isPhoneUploadedCover(url)) continue;
        }
        await ensureImage(url, dest, LINK_HEADERS);
        db.db.prepare(`UPDATE media_items SET cover_art_path = ? WHERE id = ?`).run(dest, row.id);
        // Remember where this file came from, so the next pull sees no change (and the next push
        // sends the same link). Raw SQL: bumping updated_at would re-send a row that is not new.
        db.db.prepare(`INSERT INTO cover_art_sources (path, url) VALUES (?, ?) ON CONFLICT(path) DO UPDATE SET url = excluded.url`).run(dest, url);
        fetched++;
      } catch { /* leave without art — the normal title/id lookup still applies later */ }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  return fetched;
}

module.exports = { downloadLinkedCoverArt, isPhoneUploadedCover };
