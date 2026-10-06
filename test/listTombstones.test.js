import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import VaultDatabase from "../database.js";
import cloudSync from "../lib/cloudSync.js";

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

describe("list membership removals sync (tombstones)", () => {
  let dbPath, db, item, list;
  const pushOpts = { userId: "u1", deviceId: "d1", since: "1970-01-01 00:00:00", deviceName: "test", devicePlatform: "desktop" };
  const membershipRows = (sb) => sb.upserts.filter((u) => u.name === "list_items").flatMap((u) => u.rows);
  const syncIds = () => ({
    item: db.db.prepare(`SELECT sync_id FROM media_items WHERE id = ?`).get(item.id).sync_id,
    list: db.db.prepare(`SELECT sync_id FROM lists WHERE id = ?`).get(list.id).sync_id,
  });

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `vault-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = new VaultDatabase(dbPath);
    db.initialise();
    item = db.addItem({ title: "Heat", media_type: "Movie", status: "wishlist" });
    list = db.createList("Heist films");
  });

  afterEach(() => {
    db.db.close();
    for (const suffix of ["", "-shm", "-wal"]) { try { fs.unlinkSync(dbPath + suffix); } catch {} }
  });

  it("removing an item from a list queues a removal that is pushed as a soft-deleted row", async () => {
    db.addItemsToList(list.id, [item.id]);
    db.removeItemFromList(list.id, item.id);
    const ids = syncIds();

    const sb = fakeSupabase();
    await cloudSync.pushChanges(db, sb, pushOpts);
    const rows = membershipRows(sb);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ list_sync_id: ids.list, item_sync_id: ids.item });
    expect(rows[0].deleted_at).not.toBeNull();
  });

  it("removing something that wasn't a member queues nothing; re-adding cancels a pending removal", async () => {
    db.removeItemFromList(list.id, item.id);
    expect(db.db.prepare(`SELECT COUNT(*) AS n FROM list_item_tombstones`).get().n).toBe(0);

    db.addItemsToList(list.id, [item.id]);
    db.removeItemFromList(list.id, item.id);
    db.addItemsToList(list.id, [item.id]);
    expect(db.db.prepare(`SELECT COUNT(*) AS n FROM list_item_tombstones`).get().n).toBe(0);

    const sb = fakeSupabase();
    await cloudSync.pushChanges(db, sb, pushOpts);
    expect(membershipRows(sb).every((r) => r.deleted_at === null)).toBe(true);
  });

  it("toggling a favourite off queues a removal", () => {
    db.toggleFavourite(item.id);
    db.toggleFavourite(item.id);
    expect(db.db.prepare(`SELECT COUNT(*) AS n FROM list_item_tombstones`).get().n).toBe(1);
    db.toggleFavourite(item.id);
    expect(db.db.prepare(`SELECT COUNT(*) AS n FROM list_item_tombstones`).get().n).toBe(0);
  });

  it("deleting a list pushes it as a soft-deleted list", async () => {
    const { list: listSyncId } = syncIds();
    db.deleteList(list.id);
    const sb = fakeSupabase();
    await cloudSync.pushChanges(db, sb, pushOpts);
    const sent = sb.upserts.filter((u) => u.name === "lists").flatMap((u) => u.rows).find((r) => r.sync_id === listSyncId);
    expect(sent).toMatchObject({ name: "Heist films", user_id: "u1" });
    expect(sent.deleted_at).not.toBeNull();
  });

  it("pull does not undo a removal made here that hasn't reached the cloud yet", async () => {
    db.addItemsToList(list.id, [item.id]);
    db.removeItemFromList(list.id, item.id);
    db.db.prepare(`UPDATE list_item_tombstones SET deleted_at = '2026-09-24 12:00:00'`).run();
    const ids = syncIds();

    await cloudSync.pullChanges(db, fakeSupabase({ list_items: [
      { list_sync_id: ids.list, item_sync_id: ids.item, updated_at: "2026-09-24T09:00:00+00:00", deleted_at: null },
    ] }), "1970-01-01T00:00:00");
    expect(db.db.prepare(`SELECT COUNT(*) AS n FROM list_items`).get().n).toBe(0);

    // A membership re-added elsewhere AFTER this removal does apply, and cancels the pending removal.
    await cloudSync.pullChanges(db, fakeSupabase({ list_items: [
      { list_sync_id: ids.list, item_sync_id: ids.item, updated_at: "2026-09-24T15:00:00+00:00", deleted_at: null },
    ] }), "1970-01-01T00:00:00");
    expect(db.db.prepare(`SELECT COUNT(*) AS n FROM list_items`).get().n).toBe(1);
    expect(db.db.prepare(`SELECT COUNT(*) AS n FROM list_item_tombstones`).get().n).toBe(0);
  });

  it("pull applies a removal made on another device", async () => {
    db.addItemsToList(list.id, [item.id]);
    const ids = syncIds();
    await cloudSync.pullChanges(db, fakeSupabase({ list_items: [
      { list_sync_id: ids.list, item_sync_id: ids.item, updated_at: "2026-09-24T15:00:00+00:00", deleted_at: "2026-09-24T15:00:00+00:00" },
    ] }), "1970-01-01T00:00:00");
    expect(db.db.prepare(`SELECT COUNT(*) AS n FROM list_items`).get().n).toBe(0);
  });

  it("pull doesn't blow up on a remote list whose name already exists locally", async () => {
    const remoteList = { sync_id: "11111111-1111-4111-8111-111111111111", name: "heist FILMS", is_default: false, updated_at: "2026-09-24T09:00:00+00:00", deleted_at: null };
    await expect(cloudSync.pullChanges(db, fakeSupabase({ lists: [remoteList] }), "1970-01-01T00:00:00")).resolves.toBeTruthy();
    expect(db.db.prepare(`SELECT COUNT(*) AS n FROM lists WHERE name = 'Heist films' COLLATE NOCASE`).get().n).toBe(1);
  });
});
