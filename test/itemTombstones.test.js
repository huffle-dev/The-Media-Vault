import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import VaultDatabase from "../database.js";
import cloudSync from "../lib/cloudSync.js";

function fakeSupabase(tables = {}) {
  const upserts = [];
  const updates = [];
  return {
    upserts, updates,
    from(name) {
      return {
        upsert: async (rows, opts) => { upserts.push({ name, rows: Array.isArray(rows) ? rows : [rows], opts }); return { error: null }; },
        update(patch) {
          return { eq: async (col, val) => { updates.push({ name, patch, col, val }); return { error: null }; } };
        },
        select() {
          const q = { gt: () => q, order: () => q, range: async () => ({ data: tables[name] || [], error: null }) };
          return q;
        },
      };
    },
  };
}

describe("item deletions sync (tombstones)", () => {
  let dbPath, db;
  const pushOpts = { userId: "u1", deviceId: "d1", since: "1970-01-01 00:00:00", deviceName: "test", devicePlatform: "desktop" };
  const add = (title) => db.addItem({ title, media_type: "Movie", status: "wishlist" });
  const syncIdOf = (item) => db.db.prepare(`SELECT sync_id FROM media_items WHERE id = ?`).get(item.id).sync_id;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `vault-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = new VaultDatabase(dbPath);
    db.initialise();
  });

  afterEach(() => {
    db.db.close();
    for (const suffix of ["", "-shm", "-wal"]) { try { fs.unlinkSync(dbPath + suffix); } catch {} }
  });

  it("deleting an item (or several) queues a notice per item", () => {
    const a = add("A"), b = add("B"), c = add("C");
    const ids = [syncIdOf(a), syncIdOf(b), syncIdOf(c)];
    db.deleteItem(a.id);
    db.deleteItems([b.id, c.id]);
    const queued = db.db.prepare(`SELECT sync_id FROM item_tombstones`).all().map((r) => r.sync_id).sort();
    expect(queued).toEqual([...ids].sort());
  });

  it("push soft-deletes each deleted item in the cloud (an update, not an upsert)", async () => {
    const a = add("A");
    const sid = syncIdOf(a);
    db.deleteItem(a.id);

    const sb = fakeSupabase();
    const counts = await cloudSync.pushChanges(db, sb, pushOpts);

    expect(counts.items_deleted).toBe(1);
    expect(sb.updates).toHaveLength(1);
    expect(sb.updates[0]).toMatchObject({ name: "items", col: "sync_id", val: sid });
    expect(sb.updates[0].patch.deleted_at).toBeTruthy();
    // ...and the deleted row was never sent up as a live one.
    const liveItemRows = sb.upserts.filter((u) => u.name === "items").flatMap((u) => u.rows);
    expect(liveItemRows.find((r) => r.sync_id === sid)).toBeUndefined();
  });

  it("pull does not resurrect an item deleted here that the cloud still has alive", async () => {
    const a = add("A");
    const sid = syncIdOf(a);
    db.deleteItem(a.id);
    db.db.prepare(`UPDATE item_tombstones SET deleted_at = '2026-09-24 12:00:00'`).run();

    const remote = { sync_id: sid, title: "A", media_type: "Movie", status: "wishlist", updated_at: "2026-09-24T09:00:00+00:00", created_at: "2026-09-24T09:00:00+00:00", deleted_at: null };
    await cloudSync.pullChanges(db, fakeSupabase({ items: [remote] }), "1970-01-01T00:00:00");
    expect(db.db.prepare(`SELECT COUNT(*) AS n FROM media_items WHERE sync_id = ?`).get(sid).n).toBe(0);
  });

  it("pull brings a deleted item back if it was edited elsewhere after the deletion", async () => {
    const a = add("A");
    const sid = syncIdOf(a);
    // A full cloud row (every NOT NULL column present, as a real one would be).
    const full = db.db.prepare(`SELECT * FROM media_items WHERE id = ?`).get(a.id);
    db.deleteItem(a.id);
    db.db.prepare(`UPDATE item_tombstones SET deleted_at = '2026-09-24 12:00:00'`).run();

    const remote = { ...full, sync_id: sid, title: "A edited", updated_at: "2026-09-24T15:00:00+00:00", created_at: "2026-09-24T09:00:00+00:00", deleted_at: null };
    await cloudSync.pullChanges(db, fakeSupabase({ items: [remote] }), "1970-01-01T00:00:00");
    expect(db.db.prepare(`SELECT title FROM media_items WHERE sync_id = ?`).get(sid).title).toBe("A edited");
    expect(db.db.prepare(`SELECT COUNT(*) AS n FROM item_tombstones`).get().n).toBe(0);
  });

  it("pull applies a deletion made on another device without queueing one to send back", async () => {
    const a = add("A");
    const sid = syncIdOf(a);
    const remote = { sync_id: sid, title: "A", media_type: "Movie", status: "wishlist", updated_at: "2026-09-24T15:00:00+00:00", created_at: "2026-09-24T09:00:00+00:00", deleted_at: "2026-09-24T15:00:00+00:00" };
    await cloudSync.pullChanges(db, fakeSupabase({ items: [remote] }), "1970-01-01T00:00:00");
    expect(db.db.prepare(`SELECT COUNT(*) AS n FROM media_items WHERE sync_id = ?`).get(sid).n).toBe(0);
    expect(db.db.prepare(`SELECT COUNT(*) AS n FROM item_tombstones`).get().n).toBe(0);
  });

});
