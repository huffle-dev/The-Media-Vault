import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import VaultDatabase from "../database.js";

// cover_art_sources maps each downloaded cover file to its remote source URL;
// Cloud Sync's push joins it to send items.cover_art_url. recordCoverArtSource
// must bump the owning items' updated_at only when the mapping actually
// changes — push only sends rows changed since its last checkpoint, and an
// unconditional bump would re-push every item on every Fetch Info.
describe("VaultDatabase — cover art sources", () => {
  let dbPath;
  let db;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `vault-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = new VaultDatabase(dbPath);
    db.initialise();
  });

  afterEach(() => {
    db.db.close();
    for (const suffix of ["", "-shm", "-wal"]) {
      try { fs.unlinkSync(dbPath + suffix); } catch {}
    }
  });

  const pushQuery = () => db.db.prepare(`
    SELECT m.title,
           (SELECT s.url FROM cover_art_sources s WHERE s.path = m.cover_art_path) AS cover_art_url
    FROM media_items m
  `).all();

  it("joins a recorded source URL onto the item using that file", () => {
    db.addItem({ title: "Heat", media_type: "Movie", status: "wishlist", cover_art_path: "/art/tt0113277.jpg" });
    db.addItem({ title: "Uploaded By Hand", media_type: "Movie", status: "wishlist", cover_art_path: "/art/custom.jpg" });
    db.recordCoverArtSource("/art/tt0113277.jpg", "https://image.tmdb.org/t/p/w780/heat.jpg");

    const rows = Object.fromEntries(pushQuery().map(r => [r.title, r.cover_art_url]));
    expect(rows["Heat"]).toBe("https://image.tmdb.org/t/p/w780/heat.jpg");
    expect(rows["Uploaded By Hand"]).toBeNull();
  });

  it("bumps updated_at when the mapping is new or changed, not when unchanged", () => {
    const item = db.addItem({ title: "Heat", media_type: "Movie", status: "wishlist", cover_art_path: "/art/a.jpg" });
    const stamp = (v) => db.db.prepare(`UPDATE media_items SET updated_at = ? WHERE id = ?`).run(v, item.id);
    const read = () => db.db.prepare(`SELECT updated_at FROM media_items WHERE id = ?`).get(item.id).updated_at;

    stamp("2000-01-01 00:00:00");
    db.recordCoverArtSource("/art/a.jpg", "https://example.com/1.jpg");
    expect(read()).not.toBe("2000-01-01 00:00:00");

    stamp("2000-01-01 00:00:00");
    db.recordCoverArtSource("/art/a.jpg", "https://example.com/1.jpg");
    expect(read()).toBe("2000-01-01 00:00:00");

    db.recordCoverArtSource("/art/a.jpg", "https://example.com/2.jpg");
    expect(read()).not.toBe("2000-01-01 00:00:00");
    expect(pushQuery()[0].cover_art_url).toBe("https://example.com/2.jpg");
  });

  it("ignores empty path or url", () => {
    db.recordCoverArtSource("", "https://example.com/1.jpg");
    db.recordCoverArtSource("/art/a.jpg", null);
    expect(db.db.prepare(`SELECT COUNT(*) AS n FROM cover_art_sources`).get().n).toBe(0);
  });
});
