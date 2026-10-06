import { describe, it, expect, beforeEach } from "vitest";
import { bulkSetStatus, bulkSetHidden, bulkDelete, bulkAddToList, bulkSetOwned, chunk, runLimited } from "../mobile/bulkActions.js";

// A tiny stand-in for the Supabase client that records every write and can be
// told to fail particular ids.
function fakeClient({ failIds = [] } = {}) {
  const calls = [];
  const client = {
    calls,
    from(table) {
      return {
        update(patch) {
          const q = {
            eq: async (col, id) => { calls.push({ table, op: "update", patch, ids: [id] }); return { error: failIds.includes(id) ? { message: "boom" } : null }; },
            in: async (col, ids) => { calls.push({ table, op: "update", patch, ids }); return { error: ids.some((i) => failIds.includes(i)) ? { message: "boom" } : null }; },
          };
          return q;
        },
        async upsert(rows) { calls.push({ table, op: "upsert", rows }); return { error: null }; },
      };
    },
  };
  return client;
}

const lib = [
  { sync_id: "a", title: "A", status: "wishlist", rating: null, date_consumed: null, is_hidden: 0 },
  { sync_id: "b", title: "B", status: "consumed", rating: 8, date_consumed: "2026-01-02", is_hidden: 1 },
  { sync_id: "c", title: "C", status: "in-progress", rating: null, date_consumed: null, is_hidden: 0 },
];

describe("helpers", () => {
  it("chunk splits a list", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });
  it("runLimited never exceeds the limit and returns the ones that threw", async () => {
    let running = 0, peak = 0;
    const failed = await runLimited([1, 2, 3, 4, 5, 6], async (n) => {
      running++; peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 3));
      running--;
      if (n === 4) throw new Error("x");
    }, 2);
    expect(peak).toBe(2);
    expect(failed).toEqual([4]);
  });
});

describe("bulkSetStatus", () => {
  let client;
  beforeEach(() => { client = fakeClient(); });

  it("applies desktop's status rule per item: leaving Completed clears the rating, entering it stamps a date", async () => {
    await bulkSetStatus(client, lib, ["a", "b"], "wishlist");
    const byId = Object.fromEntries(client.calls.map((c) => [c.ids[0], c.patch]));
    expect(byId.b).toMatchObject({ status: "wishlist", rating: null });
    const r2 = fakeClient();
    await bulkSetStatus(r2, lib, ["a"], "consumed");
    expect(r2.calls[0].patch.status).toBe("consumed");
    expect(r2.calls[0].patch.date_consumed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r2.calls[0].patch.updated_at).toBeTruthy();
  });

  it("reports a count and undo restores each item's old status, rating and date", async () => {
    const res = await bulkSetStatus(client, lib, ["a", "b"], "dropped", "Dropped");
    expect(res.message).toBe("2 items set to Dropped");
    client.calls.length = 0;
    await res.undo();
    const byId = Object.fromEntries(client.calls.map((c) => [c.ids[0], c.patch]));
    expect(byId.a).toMatchObject({ status: "wishlist", rating: null, date_consumed: null });
    expect(byId.b).toMatchObject({ status: "consumed", rating: 8, date_consumed: "2026-01-02" });
  });

  it("counts failures and only undoes what actually changed", async () => {
    const flaky = fakeClient({ failIds: ["b"] });
    const res = await bulkSetStatus(flaky, lib, ["a", "b"], "dropped");
    expect(res.failed).toBe(1);
    expect(res.message).toBe("1 item set to dropped");
    flaky.calls.length = 0;
    await res.undo();
    expect(flaky.calls.map((c) => c.ids[0])).toEqual(["a"]);
  });

  it("ignores ids that are not in the library", async () => {
    const res = await bulkSetStatus(client, lib, ["zzz"], "dropped");
    expect(res.message).toBe("0 items set to dropped");
    expect(client.calls).toEqual([]);
  });
});

describe("bulkSetHidden", () => {
  it("hides in one request and undo restores each item's earlier state", async () => {
    const client = fakeClient();
    const res = await bulkSetHidden(client, lib, ["a", "b", "c"], true);
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0].patch.is_hidden).toBe(1);
    expect(res.message).toBe("3 items hidden");
    client.calls.length = 0;
    await res.undo();
    const hiddenAgain = client.calls.find((c) => c.patch.is_hidden === 1);
    const visibleAgain = client.calls.find((c) => c.patch.is_hidden === 0);
    expect(hiddenAgain.ids).toEqual(["b"]);       // b was hidden already
    expect(visibleAgain.ids.sort()).toEqual(["a", "c"]);
  });
  it("says unhidden when unhiding", async () => {
    expect((await bulkSetHidden(fakeClient(), lib, ["b"], false)).message).toBe("1 item unhidden");
  });
});

describe("bulkDelete", () => {
  it("soft-deletes, and undo clears deleted_at", async () => {
    const client = fakeClient();
    const res = await bulkDelete(client, lib, ["a", "c"]);
    expect(client.calls[0].patch.deleted_at).toBeTruthy();
    expect(client.calls[0].ids).toEqual(["a", "c"]);
    expect(res.message).toBe("2 items deleted");
    client.calls.length = 0;
    await res.undo();
    expect(client.calls[0].patch.deleted_at).toBeNull();
    expect(client.calls[0].ids).toEqual(["a", "c"]);
  });
  it("splits a big selection into several requests", async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ sync_id: `i${i}` }));
    const client = fakeClient();
    await bulkDelete(client, many, many.map((m) => m.sync_id));
    expect(client.calls.map((c) => c.ids.length)).toEqual([100, 100, 50]);
  });
});

describe("bulkAddToList", () => {
  const memberships = new Map([["a", ["L1"]], ["b", ["L2"]]]);

  it("adds only the items not already on the list, and undo removes only those", async () => {
    const client = fakeClient();
    const res = await bulkAddToList(client, memberships, "L1", ["a", "b", "c"], "Favourites");
    expect(client.calls[0].rows.map((r) => r.item_sync_id)).toEqual(["b", "c"]);
    expect(res.message).toBe("2 items added to Favourites (1 already there)");
    client.calls.length = 0;
    await res.undo();
    expect(client.calls[0].rows.map((r) => [r.item_sync_id, !!r.deleted_at])).toEqual([["b", true], ["c", true]]);
  });
  it("says so when everything was already there, without writing", async () => {
    const client = fakeClient();
    const res = await bulkAddToList(client, memberships, "L1", ["a"], "Favourites");
    expect(res.message).toBe("Already on Favourites");
    expect(client.calls).toEqual([]);
  });
});

describe("bulkSetOwned (this phone's own owned mark)", () => {
  const clientWithAuth = () => {
    const c = fakeClient();
    c.auth = { getUser: async () => ({ data: { user: { id: "u1" } } }) };
    const base = c.from.bind(c);
    c.from = (table) => ({ ...base(table), upsert: async (rows, opts) => { c.calls.push({ table, op: "upsert", rows, opts }); return { error: null }; } });
    return c;
  };
  const ctx = { deviceId: "phone-1", otherOwnedIds: new Set(["c"]), phoneOwnedIds: new Set() };

  it("writes the phone's mark, moves Wishlist to Not Started, and undo puts both back", async () => {
    const c = clientWithAuth();
    const r = await bulkSetOwned(c, lib, ["a", "b"], true, ctx);
    const marks = c.calls.filter((x) => x.table === "item_locations");
    expect(marks[0].rows.map((m) => [m.item_sync_id, m.device_id, m.is_local])).toEqual([["a", "phone-1", true], ["b", "phone-1", true]]);
    const status = c.calls.filter((x) => x.table === "items");
    expect(status).toHaveLength(1); // only the wishlist one (a) changes status; b is consumed
    expect(status[0]).toMatchObject({ ids: ["a"], patch: { status: "not-started" } });
    expect(r.message).toBe("2 items marked owned");
    c.calls.length = 0;
    await r.undo();
    expect(c.calls.filter((x) => x.table === "item_locations").flatMap((x) => x.rows.map((m) => [m.item_sync_id, m.is_local]))).toEqual([["a", false], ["b", false]]);
    expect(c.calls.find((x) => x.table === "items")).toMatchObject({ ids: ["a"], patch: { status: "wishlist" } });
  });
  it("un-owning keeps Not Started when another device still owns the item", async () => {
    const c = clientWithAuth();
    const items = [{ sync_id: "c", title: "C", status: "not-started" }];
    await bulkSetOwned(c, items, ["c"], false, { deviceId: "phone-1", otherOwnedIds: new Set(["c"]), phoneOwnedIds: new Set(["c"]) });
    expect(c.calls.filter((x) => x.table === "items")).toHaveLength(0);
  });
});
