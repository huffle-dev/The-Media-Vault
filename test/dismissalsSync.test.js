import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import VaultDatabase from "../database.js";
import cloudSync from "../lib/cloudSync.js";

// Minimal stand-in for a supabase-js client: records upserts, and serves the
// given rows for `select(...).gt(...).order(...).range(...)` by table.
function fakeSupabase(tables = {}) {
  const upserts = [];
  return {
    upserts,
    from(name) {
      return {
        upsert: async (rows, opts) => { upserts.push({ name, rows: Array.isArray(rows) ? rows : [rows], opts }); return { error: null }; },
        select() {
          const q = { gt: () => q, order: () => q, range: async () => ({ data: tables[name] || [], error: null }) };
          return q;
        },
      };
    },
  };
}

describe("discovery dismissals — soft delete and Cloud Sync", () => {
  let dbPath, db;
  const pushOpts = { userId: "u1", deviceId: "d1", since: "1970-01-01 00:00:00", deviceName: "test", devicePlatform: "desktop" };

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `vault-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = new VaultDatabase(dbPath);
    db.initialise();
  });

  afterEach(() => {
    db.db.close();
    for (const suffix of ["", "-shm", "-wal"]) { try { fs.unlinkSync(dbPath + suffix); } catch {} }
  });

  it("undismiss hides the title but keeps a tombstone; re-dismissing revives it", () => {
    db.dismissDiscoveryItem("Movie", "603", "The Matrix");
    const [row] = db.getDiscoveryDismissals();
    db.undismissDiscoveryItem(row.id);
    expect(db.getDiscoveryDismissals()).toEqual([]);
    expect(db.db.prepare(`SELECT deleted_at FROM discovery_dismissed WHERE id = ?`).get(row.id).deleted_at).not.toBeNull();

    db.dismissDiscoveryItem("Movie", "603", "The Matrix");
    expect(db.getDiscoveryDismissals()).toHaveLength(1);
  });

  it("pushes dismissals (including tombstones) keyed by user + media_type + tmdb_id", async () => {
    db.dismissDiscoveryItem("Movie", "603", "The Matrix");
    db.dismissDiscoveryItem("TV", "7246", "Blackadder");
    db.undismissDiscoveryItem(db.getDiscoveryDismissals().find((d) => d.tmdb_id === "7246").id);

    const supabase = fakeSupabase();
    const counts = await cloudSync.pushChanges(db, supabase, pushOpts);
    const up = supabase.upserts.find((u) => u.name === "discovery_dismissed");

    expect(counts.discovery_dismissed).toBe(2);
    expect(up.opts.onConflict).toBe("user_id,media_type,tmdb_id");
    const byId = Object.fromEntries(up.rows.map((r) => [r.tmdb_id, r]));
    expect(byId["603"]).toMatchObject({ user_id: "u1", media_type: "Movie", title: "The Matrix", deleted_at: null });
    expect(byId["7246"].deleted_at).not.toBeNull();
  });

  it("pull inserts a new remote dismissal, and skips a remote tombstone for an unknown title", async () => {
    const supabase = fakeSupabase({
      discovery_dismissed: [
        { media_type: "Movie", tmdb_id: "1", title: "Kept", updated_at: "2026-09-24T10:00:00+00:00", deleted_at: null },
        { media_type: "Movie", tmdb_id: "2", title: "Gone", updated_at: "2026-09-24T10:00:00+00:00", deleted_at: "2026-09-24T10:00:00+00:00" },
      ],
    });
    await cloudSync.pullChanges(db, supabase, "1970-01-01T00:00:00");
    expect(db.getDiscoveryDismissals().map((d) => d.title)).toEqual(["Kept"]);
    expect(db.db.prepare(`SELECT COUNT(*) AS n FROM discovery_dismissed`).get().n).toBe(1);
  });

  it("pull applies a newer remote tombstone, and ignores an older one", async () => {
    db.dismissDiscoveryItem("Movie", "1", "Local");
    db.db.prepare(`UPDATE discovery_dismissed SET updated_at = '2026-09-24 12:00:00'`).run();

    // Older than local: ignored.
    await cloudSync.pullChanges(db, fakeSupabase({ discovery_dismissed: [
      { media_type: "Movie", tmdb_id: "1", title: "Local", updated_at: "2026-09-24T09:00:00+00:00", deleted_at: "2026-09-24T09:00:00+00:00" },
    ] }), "1970-01-01T00:00:00");
    expect(db.getDiscoveryDismissals()).toHaveLength(1);

    // Newer than local: applied.
    await cloudSync.pullChanges(db, fakeSupabase({ discovery_dismissed: [
      { media_type: "Movie", tmdb_id: "1", title: "Local", updated_at: "2026-09-24T15:00:00+00:00", deleted_at: "2026-09-24T15:00:00+00:00" },
    ] }), "1970-01-01T00:00:00");
    expect(db.getDiscoveryDismissals()).toEqual([]);
  });

  it("the v47 migration adds the sync columns to an existing v46 table", () => {
    db.db.exec(`
      DROP TABLE discovery_dismissed;
      CREATE TABLE discovery_dismissed (
        id INTEGER PRIMARY KEY AUTOINCREMENT, media_type TEXT NOT NULL, tmdb_id TEXT NOT NULL,
        title TEXT, dismissed_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (media_type, tmdb_id)
      );
      INSERT INTO discovery_dismissed (media_type, tmdb_id, title, dismissed_at) VALUES ('Movie', '9', 'Old', '2026-01-02 03:04:05');
      PRAGMA user_version = 46;
    `);
    db.db.close();

    db = new VaultDatabase(dbPath);
    db.initialise();

    const row = db.db.prepare(`SELECT updated_at, deleted_at FROM discovery_dismissed WHERE tmdb_id = '9'`).get();
    // v47 adds and backfills the columns (from dismissed_at); v48 then
    // re-stamps live rows as changed — see the next test.
    expect(row.deleted_at).toBeNull();
    expect(row.updated_at).toBeTruthy();
    expect(db.getDiscoveryDismissals()).toHaveLength(1);
  });

  it("the v48 migration re-stamps live dismissals so pre-v47 ones finally upload", async () => {
    db.dismissDiscoveryItem("Movie", "1", "Old Live");
    db.dismissDiscoveryItem("Movie", "2", "Old Undone");
    db.undismissDiscoveryItem(db.getDiscoveryDismissals().find((d) => d.tmdb_id === "2").id);
    db.db.prepare(`UPDATE discovery_dismissed SET updated_at = '2020-01-01 00:00:00'`).run();
    db.db.exec("PRAGMA user_version = 47;");
    db.db.close();

    db = new VaultDatabase(dbPath);
    db.initialise();

    // Last sync happened well after the original dismissal dates.
    const supabase = fakeSupabase();
    await cloudSync.pushChanges(db, supabase, { ...pushOpts, since: "2026-01-01 00:00:00" });
    const up = supabase.upserts.find((u) => u.name === "discovery_dismissed");
    expect(up.rows.map((r) => r.tmdb_id)).toEqual(["1"]);
  });
});
