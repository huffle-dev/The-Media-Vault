import { describe, it, expect } from "vitest";
import { fetchOwnedIds, fetchOwnership, ownedText, ownedStatusPatch, writeOwned, withOwned } from "../mobile/ownership.js";

const pagedClient = (rows) => ({
  from: () => ({ select: () => ({ eq: () => ({ range: async (a, b) => ({ data: rows.slice(a, b + 1), error: null }) }) }) }),
});

describe("fetchOwnedIds", () => {
  it("collects every item marked owned, across pages", async () => {
    const rows = Array.from({ length: 2300 }, (_, i) => ({ item_sync_id: `i${i % 2000}` })); // 300 repeats (owned on two devices)
    const owned = await fetchOwnedIds(pagedClient(rows));
    expect(owned.size).toBe(2000);
    expect(owned.has("i0")).toBe(true);
  });
  it("throws when the server refuses, so the caller keeps what it had", async () => {
    const client = { from: () => ({ select: () => ({ eq: () => ({ range: async () => ({ data: null, error: new Error("denied") }) }) }) }) };
    await expect(fetchOwnedIds(client)).rejects.toThrow("denied");
  });
});

describe("fetchOwnership / ownedText", () => {
  const client = (rows) => ({ from: () => ({ select: () => ({ eq: () => ({ eq: async () => ({ data: rows, error: null }) }) }) }) });
  it("tells this phone's mark apart from other devices', with a stand-in name when one has none", async () => {
    const o = await fetchOwnership(client([{ device_id: "me", devices: { name: "Phone" } }, { device_id: "d1", devices: { name: "Desktop PC" } }, { device_id: "d2", devices: null }]), "x", "me");
    expect(o).toEqual({ mine: true, others: ["Desktop PC", "another device"] });
  });
  it("says it plainly either way", () => {
    expect(ownedText({ mine: false, others: [] })).toBe("Not marked as owned");
    expect(ownedText({ mine: true, others: [] })).toBe("Owned — marked on this phone");
    expect(ownedText({ mine: true, others: ["Desktop PC", "Desktop PC"] })).toBe("Owned — marked on this phone, Desktop PC");
  });
});

describe("ownedStatusPatch (desktop's Wishlist / Not Started rule)", () => {
  it("owning a wishlist title makes it Not Started", () => expect(ownedStatusPatch({ status: "wishlist" }, true, false)).toEqual({ status: "not-started" }));
  it("un-owning sends Not Started back to Wishlist, unless another device still owns it", () => {
    expect(ownedStatusPatch({ status: "not-started" }, false, false)).toEqual({ status: "wishlist" });
    expect(ownedStatusPatch({ status: "not-started" }, false, true)).toBeNull();
  });
  it("leaves every other status alone", () => {
    expect(ownedStatusPatch({ status: "consumed" }, true, false)).toBeNull();
    expect(ownedStatusPatch({ status: "in-progress" }, false, false)).toBeNull();
  });
});

describe("writeOwned", () => {
  it("writes this phone's row for each id, in batches, and reports the ones that failed", async () => {
    const calls = [];
    const client = { from: (t) => ({ upsert: async (rows, opts) => { calls.push({ t, rows, opts }); return { error: calls.length === 2 ? new Error("x") : null }; } }) };
    const ids = Array.from({ length: 150 }, (_, i) => `i${i}`);
    const failed = await writeOwned(client, { deviceId: "me", ids, owned: true });
    expect(calls[0].t).toBe("item_locations");
    expect(calls[0].opts).toEqual({ onConflict: "item_sync_id,device_id" });
    expect(calls[0].rows[0]).toMatchObject({ item_sync_id: "i0", device_id: "me", is_local: true });
    expect(calls[0].rows).toHaveLength(100);
    expect(failed).toHaveLength(50);
  });
});

describe("withOwned", () => {
  it("sets is_local from the owned set, leaving untouched items as the same object", () => {
    const a = { sync_id: "a", is_local: 1 }, b = { sync_id: "b" }, c = { sync_id: "c", is_local: 1 };
    const out = withOwned([a, b, c], new Set(["a", "b"]));
    expect(out[0]).toBe(a);
    expect(out[1]).toMatchObject({ sync_id: "b", is_local: 1 });
    expect(out[2]).toMatchObject({ sync_id: "c", is_local: 0 });
  });
  it("changes nothing when the owned set isn't known yet", () => {
    const items = [{ sync_id: "a" }];
    expect(withOwned(items, null)).toBe(items);
    expect(withOwned(null, new Set())).toBeNull();
  });
});
