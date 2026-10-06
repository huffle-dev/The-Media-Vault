import { describe, it, expect } from "vitest";
import { sliceForRegion, buildIndex, providerChoices, filterByProvider, loadWatchIndex, readIndexCache, writeIndexCache, DEFAULT_PROVIDER_TYPES } from "../mobile/watchIndex.js";

const wp = (o) => JSON.stringify(o);
const rows = [
  { sync_id: "a", watch_providers: wp({ GB: { flatrate: ["Netflix", "Max"], rent: ["Apple TV"], free: [], buy: [] }, US: { flatrate: ["Hulu"] } }) },
  { sync_id: "b", watch_providers: wp({ GB: { flatrate: ["Netflix"], free: ["BBC iPlayer"] } }) },
  { sync_id: "c", watch_providers: wp({ US: { flatrate: ["Hulu"] } }) },
  { sync_id: "d", watch_providers: "{broken" },
  { sync_id: "e", watch_providers: null },
];

describe("sliceForRegion / buildIndex", () => {
  it("takes one country's short lists, empty when the country has none, null when unusable", () => {
    expect(sliceForRegion(rows[0].watch_providers, "GB")).toEqual({ flatrate: ["Netflix", "Max"], free: [], rent: ["Apple TV"], buy: [] });
    expect(sliceForRegion(rows[2].watch_providers, "GB")).toEqual({ flatrate: [], free: [], rent: [], buy: [] });
    expect(sliceForRegion("{broken", "GB")).toBeNull();
    expect(sliceForRegion(null, "GB")).toBeNull();
  });
  it("indexes the items that have data", () => {
    const index = buildIndex(rows, "GB");
    expect([...index.keys()]).toEqual(["a", "b", "c"]);
  });
});

describe("providerChoices / filterByProvider", () => {
  const index = buildIndex(rows, "GB");
  it("lists providers for the chosen kinds, most titles first", () => {
    expect(providerChoices(index, DEFAULT_PROVIDER_TYPES)).toEqual([
      { name: "Netflix", count: 2 }, { name: "BBC iPlayer", count: 1 }, { name: "Max", count: 1 },
    ]);
    expect(providerChoices(index, ["rent"])).toEqual([{ name: "Apple TV", count: 1 }]);
  });
  it("keeps only items on that provider in a chosen kind", () => {
    const items = [{ sync_id: "a" }, { sync_id: "b" }, { sync_id: "c" }, { sync_id: "x" }];
    expect(filterByProvider(items, index, "Netflix", ["flatrate"]).map((i) => i.sync_id)).toEqual(["a", "b"]);
    expect(filterByProvider(items, index, "Apple TV", ["flatrate"])).toEqual([]);
    expect(filterByProvider(items, index, "Apple TV", ["flatrate", "rent"]).map((i) => i.sync_id)).toEqual(["a"]);
    expect(filterByProvider(items, index, null, ["flatrate"])).toBe(items);
  });
});

describe("loadWatchIndex", () => {
  const client = (all) => ({
    from: () => ({ select: () => ({ in: () => ({ is: () => ({ not: () => ({ range: async (a, b) => ({ data: all.slice(a, b + 1), error: null }) }) }) }) }) }),
  });
  it("pages through every Movie and TV item", async () => {
    const many = Array.from({ length: 650 }, (_, i) => ({ sync_id: `i${i}`, watch_providers: wp({ GB: { flatrate: ["Netflix"] } }) }));
    const seen = [];
    const index = await loadWatchIndex(client(many), "GB", { onProgress: (p) => seen.push(p.done) });
    expect(index.size).toBe(650);
    expect(seen).toEqual([300, 600, 650]);
  });
  it("throws the server's message", async () => {
    const bad = { from: () => ({ select: () => ({ in: () => ({ is: () => ({ not: () => ({ range: async () => ({ data: null, error: { message: "denied" } }) }) }) }) }) }) };
    await expect(loadWatchIndex(bad, "GB")).rejects.toThrow("denied");
  });
});

describe("index cache", () => {
  const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) }; };
  it("round-trips per country, and ignores a missing or damaged entry", () => {
    const s = store();
    const index = buildIndex(rows, "GB");
    writeIndexCache("GB", index, 123, s);
    const back = readIndexCache("GB", s);
    expect(back.builtAt).toBe(123);
    expect([...back.index.keys()]).toEqual(["a", "b", "c"]);
    expect(readIndexCache("US", s)).toBeNull();
    s.setItem("mobile_watch_index_FR", "{oops");
    expect(readIndexCache("FR", s)).toBeNull();
  });
});
