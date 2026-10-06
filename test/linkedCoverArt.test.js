import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import VaultDatabase from "../database.js";
import { downloadLinkedCoverArt, isPhoneUploadedCover } from "../lib/linkedCoverArt.js";

describe("downloadLinkedCoverArt", () => {
  let dbPath, db, artDir, calls;

  const deps = (overrides = {}) => ({
    ensureImage: async (url, dest) => { calls.push(url); fs.writeFileSync(dest, "img"); },
    coverArtDir: () => artDir,
    fs, path, ...overrides,
  });
  const addItem = (title, cover_art_path = null) => {
    const item = db.addItem({ title, media_type: "Movie", status: "wishlist", cover_art_path });
    return db.db.prepare(`SELECT id, sync_id, updated_at FROM media_items WHERE id = ?`).get(item.id);
  };

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `vault-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    artDir = fs.mkdtempSync(path.join(os.tmpdir(), "art-"));
    db = new VaultDatabase(dbPath);
    db.initialise();
    calls = [];
  });

  afterEach(() => {
    db.db.close();
    for (const suffix of ["", "-shm", "-wal"]) { try { fs.unlinkSync(dbPath + suffix); } catch {} }
    fs.rmSync(artDir, { recursive: true, force: true });
  });

  it("downloads from the link for an item with no art, without bumping updated_at", async () => {
    const a = addItem("No Art");
    db.db.prepare(`UPDATE media_items SET updated_at = '2000-01-01 00:00:00' WHERE id = ?`).run(a.id);

    const n = await downloadLinkedCoverArt(db, [{ sync_id: a.sync_id, url: "https://x/1.jpg" }], deps());

    expect(n).toBe(1);
    const row = db.db.prepare(`SELECT cover_art_path, updated_at FROM media_items WHERE id = ?`).get(a.id);
    expect(fs.existsSync(row.cover_art_path)).toBe(true);
    expect(row.updated_at).toBe("2000-01-01 00:00:00");
  });

  it("skips an item whose local art file already exists", async () => {
    const existing = path.join(artDir, "have.jpg");
    fs.writeFileSync(existing, "img");
    const a = addItem("Has Art", existing);

    expect(await downloadLinkedCoverArt(db, [{ sync_id: a.sync_id, url: "https://x/1.jpg" }], deps())).toBe(0);
    expect(calls).toEqual([]);
  });

  it("re-downloads when the recorded art file is missing from disk", async () => {
    const a = addItem("Lost Art", path.join(artDir, "gone.jpg"));
    expect(await downloadLinkedCoverArt(db, [{ sync_id: a.sync_id, url: "https://x/1.jpg" }], deps())).toBe(1);
  });

  it("survives a failed download and unknown sync_ids", async () => {
    const a = addItem("Fails");
    const n = await downloadLinkedCoverArt(db, [
      { sync_id: "nope", url: "https://x/2.jpg" },
      { sync_id: a.sync_id, url: "https://x/1.jpg" },
    ], deps({ ensureImage: async () => { throw new Error("HTTP 404"); } }));
    expect(n).toBe(0);
    expect(db.db.prepare(`SELECT cover_art_path FROM media_items WHERE id = ?`).get(a.id).cover_art_path).toBeNull();
  });

  describe("a cover the phone replaced", () => {
    const U = "11111111-2222-4333-8444-555555555555";
    const phoneUrl = `https://p.supabase.co/storage/v1/object/public/covers/user-1/${U}-1760000000000.jpg`;

    it("recognises the phone's uploads and nothing else", () => {
      expect(isPhoneUploadedCover(phoneUrl)).toBe(true);
      expect(isPhoneUploadedCover(`https://p.supabase.co/storage/v1/object/public/covers/user-1/${U}.jpg`)).toBe(false); // desktop's own thumbnail
      expect(isPhoneUploadedCover("https://image.tmdb.org/t/p/w780/x.jpg")).toBe(false);
      expect(isPhoneUploadedCover(null)).toBe(false);
    });

    it("replaces existing art, remembers the new link, and does not bump updated_at", async () => {
      const existing = path.join(artDir, "old.jpg");
      fs.writeFileSync(existing, "old");
      const a = addItem("Replaced", existing);
      db.db.prepare(`INSERT INTO cover_art_sources (path, url) VALUES (?, ?)`).run(existing, "https://image.tmdb.org/t/p/w780/old.jpg");
      db.db.prepare(`UPDATE media_items SET updated_at = '2000-01-01 00:00:00' WHERE id = ?`).run(a.id);
      expect(await downloadLinkedCoverArt(db, [{ sync_id: a.sync_id, url: phoneUrl }], deps())).toBe(1);
      const row = db.db.prepare(`SELECT cover_art_path, updated_at FROM media_items WHERE id = ?`).get(a.id);
      expect(row.cover_art_path).not.toBe(existing);
      expect(row.updated_at).toBe("2000-01-01 00:00:00");
      expect(db.db.prepare(`SELECT url FROM cover_art_sources WHERE path = ?`).get(row.cover_art_path).url).toBe(phoneUrl);
      // the next pull carries the same link: nothing more to do
      calls.length = 0;
      expect(await downloadLinkedCoverArt(db, [{ sync_id: a.sync_id, url: phoneUrl }], deps())).toBe(0);
      expect(calls).toEqual([]);
    });

    it("also replaces art that was itself downloaded from an older link (no source row)", async () => {
      const first = await (async () => { const a = addItem("Linked"); await downloadLinkedCoverArt(db, [{ sync_id: a.sync_id, url: "https://x/1.jpg" }], deps()); return a; })();
      db.db.prepare(`DELETE FROM cover_art_sources`).run(); // as on a library synced before sources were recorded
      calls.length = 0;
      expect(await downloadLinkedCoverArt(db, [{ sync_id: first.sync_id, url: phoneUrl }], deps())).toBe(1);
    });

    it("leaves a hand-made crop (no recorded link) alone, and ignores other links that merely differ", async () => {
      const crop = path.join(artDir, "crop.jpg");
      fs.writeFileSync(crop, "crop");
      const a = addItem("Cropped here", crop);
      expect(await downloadLinkedCoverArt(db, [{ sync_id: a.sync_id, url: phoneUrl }], deps())).toBe(0);
      const b = addItem("Other size", path.join(artDir, "b.jpg"));
      fs.writeFileSync(path.join(artDir, "b.jpg"), "b");
      db.db.prepare(`INSERT INTO cover_art_sources (path, url) VALUES (?, ?)`).run(path.join(artDir, "b.jpg"), "https://image.tmdb.org/t/p/w780/b.jpg");
      expect(await downloadLinkedCoverArt(db, [{ sync_id: b.sync_id, url: "https://image.tmdb.org/t/p/w342/b.jpg" }], deps())).toBe(0);
    });
  });
});
