import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import VaultDatabase from "../database.js";
import thumbs from "../lib/coverThumbnails.js";

const { uploadUnlinkedCoverThumbnails, objectPath, BUCKET } = thumbs;

function fakeSupabase({ failFor = [], bucketMissing = false } = {}) {
  const uploads = [];
  return {
    uploads,
    storage: {
      from(bucket) {
        expect(bucket).toBe(BUCKET);
        return {
          async upload(p, body, opts) {
            uploads.push({ path: p, bytes: body.length, opts });
            if (bucketMissing) return { error: { message: "Bucket not found" } };
            if (failFor.some((x) => p.includes(x))) return { error: { message: "boom" } };
            return { error: null };
          },
          getPublicUrl: (p) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/covers/${p}` } }),
        };
      },
    },
  };
}

// A real database with a few items, some linked, some not.
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vault-thumbs-"));
  const db = new VaultDatabase(path.join(dir, "vault.db"));
  db.initialise();
  const art = (name) => { const p = path.join(dir, name); fs.writeFileSync(p, "image-bytes"); return p; };
  const add = (title, cover_art_path) => db.db.prepare(`INSERT INTO media_items (title, media_type, sync_id, cover_art_path) VALUES (?, 'Game', ?, ?)`).run(title, `sync-${title}`, cover_art_path);
  const linked = art("linked.jpg");
  add("Linked", linked);
  db.recordCoverArtSource(linked, "https://src/linked.jpg");
  add("Crop", art("cropped-1.jpg"));
  add("Manual", art("manual.jpg"));
  add("NoArt", null);
  add("Missing file", path.join(dir, "gone.jpg"));
  return { db, dir, cleanup: () => { db.close(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* open handle on Windows */ } } };
}

describe("objectPath", () => {
  it("is <user id>/<item id>.jpg", () => expect(objectPath("U", "S")).toBe("U/S.jpg"));
});

describe("itemsWithoutArtSource", () => {
  it("lists only items with art on disk record and no source link", () => {
    const { db, cleanup } = setup();
    expect(db.itemsWithoutArtSource().map((r) => r.sync_id).sort()).toEqual(["sync-Crop", "sync-Manual", "sync-Missing file"]);
    cleanup();
  });
});

describe("uploadUnlinkedCoverThumbnails", () => {
  const makeThumbnail = async () => Buffer.from("tiny-jpeg");

  it("uploads a thumbnail per unlinked item and records its public address as the source link", async () => {
    const { db, cleanup } = setup();
    const sb = fakeSupabase();
    const res = await uploadUnlinkedCoverThumbnails({ db, supabase: sb, userId: "USER", makeThumbnail, fs });
    expect(res).toMatchObject({ uploaded: 2, skipped: 1, failed: 0, cleared: 0 }); // the missing file is skipped, not an error
    expect(res.firstProblem).toMatch(/file not found/);
    expect(sb.uploads.map((u) => u.path).sort()).toEqual(["USER/sync-Crop.jpg", "USER/sync-Manual.jpg"]);
    expect(sb.uploads[0].opts).toEqual({ contentType: "image/jpeg", upsert: true });
    // The address is now the item's source link, so nothing is left to upload...
    const left = db.itemsWithoutArtSource().map((r) => r.sync_id);
    expect(left).toEqual(["sync-Missing file"]);
    const src = db.db.prepare(`SELECT url FROM cover_art_sources WHERE url LIKE '%covers%'`).all();
    expect(src.map((r) => r.url).sort()).toEqual([
      "https://x.supabase.co/storage/v1/object/public/covers/USER/sync-Crop.jpg",
      "https://x.supabase.co/storage/v1/object/public/covers/USER/sync-Manual.jpg",
    ]);
    // ...so a second run does no work.
    const again = await uploadUnlinkedCoverThumbnails({ db, supabase: fakeSupabase(), userId: "USER", makeThumbnail, fs });
    expect(again.uploaded).toBe(0);
    cleanup();
  });

  it("counts a failed upload and moves on to the rest", async () => {
    const { db, cleanup } = setup();
    const res = await uploadUnlinkedCoverThumbnails({ db, supabase: fakeSupabase({ failFor: ["Crop"] }), userId: "U", makeThumbnail, fs });
    expect(res).toMatchObject({ uploaded: 1, failed: 1, skipped: 1 });
    expect(db.itemsWithoutArtSource().map((r) => r.sync_id)).toContain("sync-Crop"); // retried next time
    cleanup();
  });

  it("stops at once, with a clear message, when the covers bucket does not exist", async () => {
    const { db, cleanup } = setup();
    const sb = fakeSupabase({ bucketMissing: true });
    const res = await uploadUnlinkedCoverThumbnails({ db, supabase: sb, userId: "U", makeThumbnail, fs });
    expect(res.error).toMatch(/setup SQL/);
    expect(sb.uploads).toHaveLength(1); // did not try every item
    cleanup();
  });

  it("skips a file that is not a readable image", async () => {
    const { db, cleanup } = setup();
    const res = await uploadUnlinkedCoverThumbnails({ db, supabase: fakeSupabase(), userId: "U", makeThumbnail: async () => null, fs });
    expect(res).toMatchObject({ uploaded: 0, skipped: 3 });
    cleanup();
  });

  it("never throws, even if the database does", async () => {
    const res = await uploadUnlinkedCoverThumbnails({ db: { itemsWithoutArtSource() { throw new Error("db closed"); } }, supabase: fakeSupabase(), userId: "U", makeThumbnail, fs });
    expect(res.error).toBe("db closed");
  });
});

describe("uploadUnlinkedCoverThumbnails reports why nothing was uploaded", () => {
  it("names the first problem for skipped and failed items", async () => {
    const { db, cleanup } = setup();
    const unreadable = await uploadUnlinkedCoverThumbnails({ db, supabase: fakeSupabase(), userId: "U", makeThumbnail: async () => null, fs });
    expect(unreadable.firstProblem).toMatch(/couldn't read as an image|file not found/);
    const failing = await uploadUnlinkedCoverThumbnails({ db, supabase: fakeSupabase({ failFor: ["sync-"] }), userId: "U", makeThumbnail: async () => Buffer.from("x"), fs });
    expect(failing.failed).toBe(2);
    expect(failing.firstProblem).toBe("boom");
    const thrown = await uploadUnlinkedCoverThumbnails({ db, supabase: fakeSupabase(), userId: "U", makeThumbnail: async () => { throw new Error("native image blew up"); }, fs });
    expect(thrown.firstProblem).toBe("native image blew up");
    cleanup();
  });
});

describe("a storage rule that blocks every upload", () => {
  it("stops after the first and explains how to fix it", async () => {
    const { db, cleanup } = setup();
    const uploads = [];
    const sb = { storage: { from: () => ({ upload: async (p) => { uploads.push(p); return { error: { message: "new row violates row-level security policy" } }; }, getPublicUrl: () => ({ data: { publicUrl: "x" } }) }) } };
    const res = await uploadUnlinkedCoverThumbnails({ db, supabase: sb, userId: "U", makeThumbnail: async () => Buffer.from("x"), fs });
    expect(uploads).toHaveLength(1);
    expect(res.error).toMatch(/storage rules/);
    expect(res.error).toMatch(/setup SQL/);
    cleanup();
  });
});

describe("empty cover files", () => {
  it("clears an item whose picture file is zero bytes, instead of reporting it every time", async () => {
    const { db, dir, cleanup } = setup();
    const empty = path.join(dir, "empty.jpg");
    fs.writeFileSync(empty, "");
    db.db.prepare(`INSERT INTO media_items (title, media_type, sync_id, cover_art_path) VALUES ('Empty', 'Movie', 'sync-Empty', ?)`).run(empty);
    const res = await uploadUnlinkedCoverThumbnails({ db, supabase: fakeSupabase(), userId: "U", makeThumbnail: async () => Buffer.from("x"), fs });
    expect(res.cleared).toBe(1);
    expect(fs.existsSync(empty)).toBe(false);
    expect(db.db.prepare(`SELECT cover_art_path FROM media_items WHERE sync_id = 'sync-Empty'`).get().cover_art_path).toBeNull();
    // and it isn't a candidate any more
    expect(db.itemsWithoutArtSource().map((r) => r.sync_id)).not.toContain("sync-Empty");
    cleanup();
  });
});
