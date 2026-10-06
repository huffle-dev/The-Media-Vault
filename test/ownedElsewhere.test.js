import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import VaultDatabase from "../database.js";
import cloudSync from "../lib/cloudSync.js";
import { applyOwnedRatedFilter, isOwned } from "@media-vault/core/tokens/filters.js";
import { isOwned as isOwnedHelper } from "@media-vault/core/tokens/itemHelpers.js";

let db, dbPath;
beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `vault-owned-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  db = new VaultDatabase(dbPath);
  db.initialise();
});
afterEach(() => { db.db.close(); for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) { try { fs.unlinkSync(f); } catch { /* gone */ } } });

const add = (title) => {
  const added = db.addItem({ title, media_type: "Movie", status: "wishlist" });
  const id = added.id;
  return { id, sync: db.db.prepare(`SELECT sync_id FROM media_items WHERE id = ?`).get(id).sync_id };
};
const owned = (id) => db.db.prepare(`SELECT owned_elsewhere FROM media_items WHERE id = ?`).get(id).owned_elsewhere;

describe("setOwnedElsewhere", () => {
  it("starts at 0, marks what another device owns, and clears what it no longer owns", () => {
    const a = add("A"), b = add("B");
    expect(owned(a.id)).toBe(0);
    expect(db.setOwnedElsewhere([a.sync])).toBe(1);
    expect(owned(a.id)).toBe(1);
    expect(owned(b.id)).toBe(0);
    expect(db.setOwnedElsewhere([b.sync])).toBe(2); // a cleared, b set
    expect(owned(a.id)).toBe(0);
    expect(owned(b.id)).toBe(1);
  });
  it("writes nothing when nothing changed (so a quiet sync doesn't look like an edit)", () => {
    const a = add("A");
    db.setOwnedElsewhere([a.sync]);
    const before = db.db.prepare("SELECT total_changes() AS n").get().n;
    expect(db.setOwnedElsewhere([a.sync])).toBe(0);
    expect(db.db.prepare("SELECT total_changes() AS n").get().n).toBe(before);
  });
  it("ignores ids this library doesn't have", () => {
    add("A");
    expect(db.setOwnedElsewhere(["not-a-real-id"])).toBe(0);
  });
  it("does not touch is_local (owned on this computer is separate)", () => {
    const a = add("A");
    db.setOwnedElsewhere([a.sync]);
    expect(db.getItem(a.id).is_local).toBe(0);
  });
});

describe("pullRemoteOwnership", () => {
  const fake = (rowsByCall, onQuery) => ({
    from: () => {
      const q = { filters: [] };
      const chain = {
        select: () => chain,
        eq: (c, v) => { q.filters.push(["eq", c, v]); return chain; },
        neq: (c, v) => { q.filters.push(["neq", c, v]); return chain; },
        range: async (a) => { onQuery && onQuery(q); return { data: rowsByCall(a), error: null }; },
      };
      return chain;
    },
  });

  it("asks only for other devices' owned rows and stores them", async () => {
    const a = add("A");
    let seen;
    const supabase = fake(() => [{ item_sync_id: a.sync }], (q) => { seen = q.filters; });
    const changed = await cloudSync.pullRemoteOwnership(db, supabase, "this-device");
    expect(changed).toBe(1);
    expect(owned(a.id)).toBe(1);
    expect(seen).toEqual(expect.arrayContaining([["eq", "is_local", true], ["neq", "device_id", "this-device"]]));
  });
  it("throws on a server error so the sync can carry on without it", async () => {
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ neq: () => ({ range: async () => ({ data: null, error: new Error("denied") }) }) }) }) }) };
    await expect(cloudSync.pullRemoteOwnership(db, supabase, "d")).rejects.toThrow("denied");
  });
});

describe("isOwned and the Owned filter", () => {
  it("counts this computer or another device", () => {
    expect(isOwnedHelper({ is_local: 1, owned_elsewhere: 0 })).toBe(true);
    expect(isOwnedHelper({ is_local: 0, owned_elsewhere: 1 })).toBe(true);
    expect(isOwnedHelper({ is_local: 0, owned_elsewhere: 0 })).toBe(false);
    expect(isOwnedHelper({ is_local: 0 })).toBe(false); // phone rows have no owned_elsewhere
    expect(isOwned).toBeUndefined(); // helper lives in itemHelpers, not filters
  });
  it("the filter uses it both ways", () => {
    const items = [{ id: 1, is_local: 1 }, { id: 2, is_local: 0, owned_elsewhere: 1 }, { id: 3, is_local: 0, owned_elsewhere: 0 }];
    expect(applyOwnedRatedFilter(items, "owned", "all").map((i) => i.id)).toEqual([1, 2]);
    expect(applyOwnedRatedFilter(items, "not-owned", "all").map((i) => i.id)).toEqual([3]);
  });
});
