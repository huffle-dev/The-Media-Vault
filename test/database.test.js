import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import VaultDatabaseModule from "../database.js";
import { EXPORT_HEADERS } from "@media-vault/core/csv";
const VaultDatabase = VaultDatabaseModule;

// addItem/updateItem both build their SQL from a fixed, explicit column
// list rather than spreading whatever's in `data` — real bug found this
// session: the rating-breakdown columns were added to the schema but never
// added to either list, so the Edit modal's Save silently dropped them
// while a bulk background sync (which writes through updateFields/
// patchNullFields instead, no whitelist) worked fine. These tests exercise
// exactly that path so a future column addition can't regress the same way.
describe("VaultDatabase — rating breakdown fields", () => {
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

  it("addItem persists every per-source rating field", () => {
    const added = db.addItem({
      title: "Test Film",
      media_type: "Movie",
      status: "wishlist",
      imdb_rating: 8.2,
      imdb_votes: 240885,
      rotten_tomatoes_rating: 98,
      metacritic_rating: 88,
      tmdb_rating: 8.1,
      tmdb_votes: 3704,
      bgg_rating: 8.18,
      bgg_rating_count: 114275,
      bgg_rank: 9,
      anilist_score: 91,
    });

    expect(added.imdb_rating).toBe(8.2);
    expect(added.imdb_votes).toBe(240885);
    expect(added.rotten_tomatoes_rating).toBe(98);
    expect(added.metacritic_rating).toBe(88);
    expect(added.tmdb_rating).toBe(8.1);
    expect(added.tmdb_votes).toBe(3704);
    expect(added.bgg_rating).toBe(8.18);
    expect(added.bgg_rating_count).toBe(114275);
    expect(added.bgg_rank).toBe(9);
    expect(added.anilist_score).toBe(91);
  });

  it("addItem leaves rating fields null when not provided", () => {
    const added = db.addItem({ title: "No Ratings Yet", media_type: "Book", status: "wishlist" });
    expect(added.imdb_rating).toBeNull();
    expect(added.bgg_rating).toBeNull();
    expect(added.anilist_score).toBeNull();
  });

  it("updateItem persists every per-source rating field — this is the exact bug: the Edit modal's Save previously dropped all of these silently", () => {
    const created = db.addItem({ title: "Test Film 2", media_type: "Movie", status: "wishlist" });
    expect(created.imdb_rating).toBeNull();

    const updated = db.updateItem(created.id, {
      ...created,
      imdb_rating: 8.2,
      imdb_votes: 240885,
      rotten_tomatoes_rating: 98,
      metacritic_rating: 88,
      bgg_rating: 8.18,
      bgg_rating_count: 114275,
      bgg_rank: 9,
      anilist_score: 91,
    });

    expect(updated.imdb_rating).toBe(8.2);
    expect(updated.imdb_votes).toBe(240885);
    expect(updated.rotten_tomatoes_rating).toBe(98);
    expect(updated.metacritic_rating).toBe(88);
    expect(updated.bgg_rating).toBe(8.18);
    expect(updated.bgg_rating_count).toBe(114275);
    expect(updated.bgg_rank).toBe(9);
    expect(updated.anilist_score).toBe(91);

    // Also confirm it's actually durable — re-read from a fresh query, not
    // just trusting updateItem's own return value.
    const reread = db.getItem(created.id);
    expect(reread.imdb_rating).toBe(8.2);
    expect(reread.anilist_score).toBe(91);
  });
});

// Same class of bug as above, different column — added alongside the
// Discogs Music integration (v26). Verifies the whitelist in addItem/
// updateItem was actually extended, not just the schema.
describe("VaultDatabase — Music tracklist field", () => {
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

  const sampleTracklist = JSON.stringify([
    { position: "1", title: "Speak To Me", duration: null },
    { position: "2", title: "Breathe", duration: "2:43" },
  ]);

  it("addItem persists the tracklist field", () => {
    const added = db.addItem({
      title: "Dark Side Of The Moon", media_type: "Music", status: "wishlist",
      tracklist: sampleTracklist,
    });
    expect(added.tracklist).toBe(sampleTracklist);
  });

  it("addItem leaves tracklist null when not provided", () => {
    const added = db.addItem({ title: "No Tracklist Yet", media_type: "Music", status: "wishlist" });
    expect(added.tracklist).toBeNull();
  });

  it("updateItem persists the tracklist field and it's durable on re-read", () => {
    const created = db.addItem({ title: "Dark Side Of The Moon", media_type: "Music", status: "wishlist" });
    expect(created.tracklist).toBeNull();

    const updated = db.updateItem(created.id, { ...created, tracklist: sampleTracklist });
    expect(updated.tracklist).toBe(sampleTracklist);

    const reread = db.getItem(created.id);
    expect(reread.tracklist).toBe(sampleTracklist);
  });
});

// coverArtPathInUse backs the "also delete its cover art file" delete-time
// prompt's safety guard: the slugify(title)-year fallback filename
// (coverArt:fetch, for anything without an external id) isn't guaranteed
// unique per item, so two different items can share a physical file today.
// Deleting one must never silently blank out the other's art.
describe("VaultDatabase — coverArtPathInUse", () => {
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

  it("returns false for a path nothing references", () => {
    expect(db.coverArtPathInUse("/fake/cover_art/nothing.jpg")).toBe(false);
  });

  it("returns true while an item still references the path", () => {
    db.addItem({ title: "Solo Item", media_type: "Movie", status: "wishlist", cover_art_path: "/fake/cover_art/solo.jpg" });
    expect(db.coverArtPathInUse("/fake/cover_art/solo.jpg")).toBe(true);
  });

  it("stays true after deleting one of two items sharing the same path — the exact collision this guard exists for", () => {
    const shared = "/fake/cover_art/shared-title-2020.jpg";
    const a = db.addItem({ title: "Duplicate Title", media_type: "Movie", status: "wishlist", cover_art_path: shared });
    const b = db.addItem({ title: "Duplicate Title", media_type: "Movie", status: "wishlist", cover_art_path: shared });

    db.deleteItem(a.id);
    // b still exists and still points at the same file — must not be reported as free to delete.
    expect(db.coverArtPathInUse(shared)).toBe(true);

    db.deleteItem(b.id);
    expect(db.coverArtPathInUse(shared)).toBe(false);
  });

  // Real bug found live: a handful of historical Audible/Libation
  // cover_art_path values were stored with forward slashes, while every
  // fresh path in this app is built with path.join (backslashes on
  // Windows). A raw `=` comparison never matched, so the orphan-art scanner
  // (main.js's coverArt:scanOrphaned, which calls this) treated 40 real,
  // still-referenced cover images as orphaned and deleted them. This must
  // match regardless of which separator style either side uses.
  it("matches regardless of forward- vs back-slash separators on either side", () => {
    db.addItem({ title: "Forward Slash Stored", media_type: "Audiobook", status: "not-started", cover_art_path: "C:/Users/test/cover_art/audible-ABC123.jpg" });
    expect(db.coverArtPathInUse("C:\\Users\\test\\cover_art\\audible-ABC123.jpg")).toBe(true);

    db.addItem({ title: "Backslash Stored", media_type: "Audiobook", status: "not-started", cover_art_path: "C:\\Users\\test\\cover_art\\audible-XYZ789.jpg" });
    expect(db.coverArtPathInUse("C:/Users/test/cover_art/audible-XYZ789.jpg")).toBe(true);
  });

  it("matches regardless of case", () => {
    db.addItem({ title: "Mixed Case Path", media_type: "Movie", status: "wishlist", cover_art_path: "C:\\Users\\Test\\Cover_Art\\Film.jpg" });
    expect(db.coverArtPathInUse("c:\\users\\test\\cover_art\\film.jpg")).toBe(true);
  });
});

// Same class of bug as the two describe blocks above — the column existed
// in the schema but wasn't in addItem/updateItem's whitelist, so it was
// silently dropped even though every real fetch handler (main.js) now
// returns it. Added alongside the Library Info card's "Last enriched" row.
describe("VaultDatabase — metadata_checked_date field", () => {
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

  it("addItem persists metadata_checked_date", () => {
    const added = db.addItem({ title: "Enriched On Add", media_type: "Movie", status: "wishlist", metadata_checked_date: "2026-07-20" });
    expect(added.metadata_checked_date).toBe("2026-07-20");
  });

  it("addItem leaves metadata_checked_date null when not provided (e.g. a manually-typed item)", () => {
    const added = db.addItem({ title: "Manual Entry", media_type: "Movie", status: "wishlist" });
    expect(added.metadata_checked_date).toBeNull();
  });

  it("updateItem persists metadata_checked_date and it's durable on re-read", () => {
    const created = db.addItem({ title: "Fetch Info Later", media_type: "Movie", status: "wishlist" });
    expect(created.metadata_checked_date).toBeNull();

    const updated = db.updateItem(created.id, { ...created, metadata_checked_date: "2026-08-06" });
    expect(updated.metadata_checked_date).toBe("2026-08-06");

    const reread = db.getItem(created.id);
    expect(reread.metadata_checked_date).toBe("2026-08-06");
  });
});

// Discovery's "not interested" minus button — dismissals need to survive a
// restart (main.js's discovery:recommendations/trending exclude them on
// every future fetch), so this is the one thing standing between "dismiss
// works this session" and "dismiss actually does what it says."
describe("VaultDatabase — discovery_dismissed", () => {
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

  it("dismissDiscoveryItem persists a dismissal, returned by getDiscoveryDismissals", () => {
    db.dismissDiscoveryItem("TV", "7246", "Blackadder");
    const rows = db.getDiscoveryDismissals();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ media_type: "TV", tmdb_id: "7246", title: "Blackadder" });
  });

  it("dismissing the same media_type+tmdb_id twice is a no-op, not a duplicate row or an error", () => {
    db.dismissDiscoveryItem("Movie", "603", "The Matrix");
    expect(() => db.dismissDiscoveryItem("Movie", "603", "The Matrix")).not.toThrow();
    expect(db.getDiscoveryDismissals()).toHaveLength(1);
  });

  it("distinguishes the same tmdb_id across Film vs TV", () => {
    db.dismissDiscoveryItem("Movie", "100", "Same Id, Different Type");
    db.dismissDiscoveryItem("TV", "100", "Same Id, Different Type");
    expect(db.getDiscoveryDismissals()).toHaveLength(2);
  });

  it("getDiscoveryDismissals returns an empty array when nothing's been dismissed", () => {
    expect(db.getDiscoveryDismissals()).toEqual([]);
  });
});

// Real bug found via user testing: the bare-title fallback had no year
// check, so searching for a remake/reboot sharing a title with something
// already owned (verified live: adding "Dune" (2021, TMDB id 438631) with
// an existing "Dune" (1984, TMDB id 841) already in the library) silently
// matched the wrong film as a "duplicate" and redirected into its profile
// instead of previewing the one actually clicked — imdb_url and platform_id
// both correctly failed to match first, so this was really only reachable
// via the title-only tier, but that tier alone was firing for two
// genuinely different films.
describe("VaultDatabase — findDuplicate", () => {
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

  it("does not treat two different years of the same bare title as duplicates (real case: Dune 1984 vs 2021)", () => {
    db.addItem({ title: "Dune", media_type: "Movie", status: "wishlist", year: 1984, platform_id: "841", imdb_url: "https://www.imdb.com/title/tt0087182/" });
    const dupe = db.findDuplicate({ title: "Dune", media_type: "Movie", year: 2021, platform_id: "438631", imdb_url: "https://www.imdb.com/title/tt1160419/" });
    expect(dupe).toBeNull();
  });

  it("still matches the same title+year as a duplicate", () => {
    db.addItem({ title: "Dune", media_type: "Movie", status: "wishlist", year: 1984 });
    const dupe = db.findDuplicate({ title: "Dune", media_type: "Movie", year: 1984 });
    expect(dupe).not.toBeNull();
  });

  it("still matches on bare title when neither side has a year (nothing more specific to compare)", () => {
    db.addItem({ title: "Some Undated Thing", media_type: "Movie", status: "wishlist" });
    const dupe = db.findDuplicate({ title: "Some Undated Thing", media_type: "Movie" });
    expect(dupe).not.toBeNull();
  });

  it("imdb_url match still wins outright, regardless of year", () => {
    db.addItem({ title: "Dune", media_type: "Movie", status: "wishlist", year: 1984, imdb_url: "https://www.imdb.com/title/tt0087182/" });
    const dupe = db.findDuplicate({ title: "Something Else Entirely", media_type: "Movie", year: 2021, imdb_url: "https://www.imdb.com/title/tt0087182/" });
    expect(dupe).not.toBeNull();
  });
});

// importItems (called by both CSV import and Vault-export re-import) builds
// its INSERT from a fixed, hand-enumerated column list, separate from
// EXPORT_HEADERS (packages/core/csv.js) — a column has gone missing from importItems'
// list three times across this project's history (cover_art_path,
// openlibrary_rating, and cover_art_path again for the Vault-export
// round-trip). This test would have caught two of the three: it fails loudly
// the moment a future EXPORT_HEADERS entry isn't actually persisted by
// importItems, instead of silently dropping data on the next real import.
describe("VaultDatabase — importItems handles every EXPORT_HEADERS field", () => {
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

  it("round-trips a distinct value for every non-special EXPORT_HEADERS field", () => {
    // "lists" isn't a media_items column — it fans out into the lists/
    // list_items join tables instead, and gets its own test below.
    // media_type/status/is_local get real, valid values rather than
    // fields-named-after-themselves, since the schema/app logic actually
    // constrains them (an arbitrary media_type would still insert, since
    // SQLite doesn't enforce CHECK-less TEXT columns, but wouldn't reflect
    // how a real import row looks).
    // rating is the only EXPORT_HEADERS field with a real CHECK constraint
    // (media_items enforces 1-21, the app's stored -10..+10 display range).
    const specialCased = { media_type: "Movie", status: "wishlist", is_local: 1, rating: 15 };
    const row = { title: "EXPORT_HEADERS coverage test" };
    for (const header of EXPORT_HEADERS) {
      if (header === "title" || header === "lists") continue;
      row[header] = header in specialCased ? specialCased[header] : `${header}_value`;
    }

    const { imported } = db.importItems([row]);
    expect(imported).toBe(1);

    const inserted = db.db.prepare(`SELECT * FROM media_items WHERE title = ?`).get(row.title);
    expect(inserted).toBeTruthy();

    for (const header of EXPORT_HEADERS) {
      if (header === "lists") continue;
      // Loose equality: SQLite's dynamic typing can hand back "42" as 42
      // for a column with INTEGER affinity even though a real numeric
      // field's real value was passed in as a number, not this test's
      // placeholder string — the point here is "was it persisted at all",
      // not exact type fidelity, which the app's own per-field parsing
      // (parseInt/parseFloat at read time) already owns.
      expect(String(inserted[header])).toBe(String(row[header]));
    }
  });

  it("fans the lists field out into real lists and links the item to each", () => {
    const row = { title: "Item with lists", media_type: "Movie", status: "wishlist", lists: "Favourites of Import, Second List" };
    db.importItems([row]);

    const item = db.db.prepare(`SELECT id FROM media_items WHERE title = ?`).get(row.title);
    const linkedListNames = db.db.prepare(`
      SELECT lists.name FROM lists
      JOIN list_items ON list_items.list_id = lists.id
      WHERE list_items.item_id = ?
      ORDER BY lists.name
    `).all(item.id).map(r => r.name);

    expect(linkedListNames).toEqual(["Favourites of Import", "Second List"]);
  });
});

// Real bug found live: every "disconnect"/"forget" handler (gog:disconnect,
// epic:disconnect, cloudSync:disconnect, cloudSync:secretsForget) calls
// setSetting(key, null) to clear a stored value — settings.value is
// NOT NULL, so that used to throw a constraint violation the instant a
// user actually clicked Disconnect/Forget on an existing value, rather
// than clearing it.
describe("VaultDatabase — setSetting(key, null) clears rather than errors", () => {
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

  it("deletes an existing setting instead of violating the NOT NULL constraint", () => {
    db.setSetting("gog_refresh_token", "some-token");
    expect(db.getSetting("gog_refresh_token")).toBe("some-token");

    expect(() => db.setSetting("gog_refresh_token", null)).not.toThrow();
    expect(db.getSetting("gog_refresh_token")).toBeNull();
  });

  it("is a no-op (not an error) when the key never existed", () => {
    expect(() => db.setSetting("never_set_key", null)).not.toThrow();
    expect(db.getSetting("never_set_key")).toBeNull();
  });

  it("still writes a real value normally", () => {
    db.setSetting("some_key", "some_value");
    expect(db.getSetting("some_key")).toBe("some_value");
  });
});
