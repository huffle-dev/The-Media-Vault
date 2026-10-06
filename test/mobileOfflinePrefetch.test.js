import { describe, it, expect, vi } from "vitest";
import { itemsToPrefetch, prefetchItems, orphanNames, pruneManifest } from "../mobile/offlinePrefetch.js";

const item = (id, updated_at = "t1") => ({ sync_id: id, updated_at });

describe("itemsToPrefetch", () => {
  it("takes items that were never saved or have changed since", () => {
    const items = [item("a", "t1"), item("b", "t2"), item("c", "t1")];
    expect(itemsToPrefetch(items, { a: "t1", b: "t1" }).map((i) => i.sync_id)).toEqual(["b", "c"]);
  });
  it("takes everything when nothing has been saved yet", () => {
    expect(itemsToPrefetch([item("a")], null)).toHaveLength(1);
    expect(itemsToPrefetch(null, {})).toEqual([]);
  });
});

const fakeClient = (rowsFor, fail = () => false) => ({
  from: () => ({ select: () => ({ in: async (_c, ids) => (fail(ids) ? { data: null, error: new Error("x") } : { data: ids.map(rowsFor), error: null }) }) }),
});

describe("prefetchItems", () => {
  it("saves every row, in batches of 100, and records what it saved", async () => {
    const items = Array.from({ length: 250 }, (_, i) => item(`i${i}`, "t9"));
    const save = vi.fn();
    const progress = [];
    const res = await prefetchItems({ client: fakeClient((id) => ({ sync_id: id, updated_at: "t9", title: id })), items, save, onProgress: (p) => progress.push(p.done) });
    expect(res.saved).toBe(250);
    expect(res.failed).toBe(0);
    expect(save).toHaveBeenCalledTimes(250);
    expect(res.manifest.i0).toBe("t9");
    expect(progress).toEqual([0, 100, 200, 250]);
  });
  it("counts a failed batch but still does the others", async () => {
    const items = Array.from({ length: 150 }, (_, i) => item(`i${i}`));
    const res = await prefetchItems({ client: fakeClient((id) => ({ sync_id: id, updated_at: "t1" }), (ids) => ids[0] === "i0"), items, save: () => {} });
    expect(res.saved).toBe(50);
    expect(res.failed).toBe(100);
  });
  it("stops when cancelled", async () => {
    const items = Array.from({ length: 200 }, (_, i) => item(`i${i}`));
    let calls = 0;
    const res = await prefetchItems({ client: fakeClient((id) => ({ sync_id: id, updated_at: "t1" })), items, save: () => {}, isCancelled: () => calls++ >= 1 });
    expect(res.saved).toBe(100);
  });
});

describe("cleanup helpers", () => {
  it("finds files nothing refers to", () => {
    expect(orphanNames(["a.json", "b.json", "c.json"], ["b.json"])).toEqual(["a.json", "c.json"]);
    expect(orphanNames(null, ["x"])).toEqual([]);
  });
  it("forgets manifest entries for deleted items", () => {
    expect(pruneManifest({ a: "1", b: "2" }, [item("b")])).toEqual({ b: "2" });
  });
});
