import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { AsyncLocalStorage } from "async_hooks";
import VaultDatabase from "../database.js";
import { backfillCoverArtLinks, itemsMissingSource, derivedSourceUrl } from "../lib/coverArtBackfill.js";

describe("backfillCoverArtLinks", () => {
  let dbPath, db, captureStore;

  const add = (title, cover_art_path, extra = {}) =>
    db.addItem({ title, media_type: "Movie", status: "wishlist", platform_id: title, cover_art_path, ...extra });

  // Stand-in for coverArtLookup: "downloads" (captures) a URL derived from
  // the item, the way a service would call storage.ensureImage.
  const lookupWith = (fn) => async (item) => {
    const url = fn(item);
    if (url) captureStore.getStore().url = url;
    return null;
  };

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `vault-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = new VaultDatabase(dbPath);
    db.initialise();
    captureStore = new AsyncLocalStorage();
  });

  afterEach(() => {
    db.db.close();
    for (const suffix of ["", "-shm", "-wal"]) { try { fs.unlinkSync(dbPath + suffix); } catch {} }
  });

  it("records the URL a lookup finds against each item's existing art path", async () => {
    add("A", "/art/a.jpg");
    add("B", "/art/b.jpg");
    const result = await backfillCoverArtLinks(db, {
      lookup: lookupWith((i) => `https://img/${i.title}.jpg`), captureStore, keys: {}, delayMs: 0,
    });
    expect(result).toEqual({ total: 2, recorded: 2 });
    const rows = db.db.prepare(`SELECT path, url FROM cover_art_sources ORDER BY path`).all();
    expect(rows).toEqual([
      { path: "/art/a.jpg", url: "https://img/A.jpg" },
      { path: "/art/b.jpg", url: "https://img/B.jpg" },
    ]);
  });

  it("skips items that already have a source, no art, and hand-cropped art", async () => {
    add("Has Source", "/art/has.jpg");
    db.recordCoverArtSource("/art/has.jpg", "https://img/has.jpg");
    add("No Art", null);
    add("Cropped", "/art/cropped-123.jpeg");
    add("Todo", "/art/todo.jpg");

    expect(itemsMissingSource(db).map((i) => i.title)).toEqual(["Todo"]);
  });

  it("leaves an item alone when the lookup finds nothing or throws, and carries on", async () => {
    add("Nothing", "/art/n.jpg");
    add("Boom", "/art/b.jpg");
    add("Fine", "/art/f.jpg");
    const result = await backfillCoverArtLinks(db, {
      lookup: async (item) => {
        if (item.title === "Boom") throw new Error("HTTP 500");
        if (item.title === "Fine") captureStore.getStore().url = "https://img/f.jpg";
        return null;
      },
      captureStore, keys: {}, delayMs: 0,
    });
    expect(result).toEqual({ total: 3, recorded: 1 });
  });

  it("keeps each item's URL separate under concurrency", async () => {
    for (let i = 0; i < 12; i++) add(`T${i}`, `/art/t${i}.jpg`);
    await backfillCoverArtLinks(db, {
      lookup: async (item) => {
        await new Promise((r) => setTimeout(r, Math.random() * 10));
        captureStore.getStore().url = `https://img/${item.title}.jpg`;
        return null;
      },
      captureStore, keys: {}, concurrency: 6, delayMs: 0,
    });
    for (const r of db.db.prepare(`SELECT path, url FROM cover_art_sources`).all()) {
      expect(r.url).toBe(`https://img/T${r.path.match(/t(\d+)/)[1]}.jpg`);
    }
  });

  it("reports progress up front and after every item", async () => {
    add("A", "/art/a.jpg");
    add("B", "/art/b.jpg");
    const seen = [];
    await backfillCoverArtLinks(db, {
      lookup: lookupWith((i) => (i.title === "A" ? "https://img/a.jpg" : null)),
      captureStore, keys: {}, delayMs: 0, concurrency: 1,
      onProgress: (p) => seen.push(p),
    });
    expect(seen).toEqual([
      { done: 0, total: 2, recorded: 0 },
      { done: 1, total: 2, recorded: 1 },
      { done: 2, total: 2, recorded: 1 },
    ]);
  });

  it("derives an audiobook's Amazon image URL from its Libation-style file name when the lookup finds nothing", async () => {
    db.addItem({ title: "Libation", media_type: "Audiobook", status: "wishlist", platform_id: "audible-B084NZBQBZ", cover_art_path: "C:/vault/cover_art/audible-51+0l7svAGL.jpg" });
    const verified = [];
    const result = await backfillCoverArtLinks(db, {
      lookup: async () => null, captureStore, keys: {}, delayMs: 0,
      verify: async (url) => { verified.push(url); },
    });
    expect(result).toEqual({ total: 1, recorded: 1 });
    expect(verified).toEqual(["https://m.media-amazon.com/images/I/51+0l7svAGL.jpg"]);
    expect(db.db.prepare(`SELECT url FROM cover_art_sources`).get().url).toBe("https://m.media-amazon.com/images/I/51+0l7svAGL.jpg");
  });

  it("only derives for Libation-style audiobook names — not an ASIN-named file, another type, or other patterns", () => {
    const item = (media_type, file) => ({ media_type, cover_art_path: `/art/${file}` });
    expect(derivedSourceUrl(item("Audiobook", "audible-51+0l7svAGL.jpg"))).toBe("https://m.media-amazon.com/images/I/51+0l7svAGL.jpg");
    expect(derivedSourceUrl(item("Audiobook", "audible-B08G9PRS1K.jpg"))).toBeNull();
    expect(derivedSourceUrl(item("Movie", "audible-51+0l7svAGL.jpg"))).toBeNull();
    expect(derivedSourceUrl(item("Audiobook", "something-else.jpg"))).toBeNull();
  });

  it("doesn't record a derived URL that fails verification", async () => {
    db.addItem({ title: "Gone", media_type: "Audiobook", status: "wishlist", platform_id: "audible-X", cover_art_path: "/art/audible-51gone.jpg" });
    const result = await backfillCoverArtLinks(db, {
      lookup: async () => null, captureStore, keys: {}, delayMs: 0,
      verify: async () => { throw new Error("HTTP 404"); },
    });
    expect(result.recorded).toBe(0);
  });
});

describe("backfillCoverArtLinks: not retrying what just failed", () => {
  it("skips the paths it is told to skip and reports each item that fails again", async () => {
    const dbPath = path.join(os.tmpdir(), `vault-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    const db = new VaultDatabase(dbPath);
    db.initialise();
    const captureStore = new AsyncLocalStorage();
    for (const t of ["Found", "Known bad", "New bad"]) db.addItem({ title: t, media_type: "Movie", status: "wishlist", platform_id: t, cover_art_path: path.join(os.tmpdir(), `${t}.jpg`) });
    const looked = [];
    const lookup = async (item) => { looked.push(item.title); if (item.title === "Found") captureStore.getStore().url = "https://img/found.jpg"; };
    const failed = [];
    const res = await backfillCoverArtLinks(db, {
      lookup, captureStore, keys: {}, delayMs: 0, verify: async () => {},
      skipPaths: new Set([path.join(os.tmpdir(), "Known bad.jpg")]),
      onFailed: (item) => failed.push(item.title),
    });
    expect(looked.sort()).toEqual(["Found", "New bad"]); // "Known bad" was never looked up
    expect(failed).toEqual(["New bad"]);
    expect(res).toEqual({ total: 2, recorded: 1 });
    db.close();
    for (const suffix of ["", "-wal", "-shm"]) { try { fs.rmSync(dbPath + suffix, { force: true }); } catch { /* open handle on Windows */ } }
  });
});
