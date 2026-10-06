import { describe, it, expect } from "vitest";
import { watchBuckets, watchLink, watchChecked, guessRegion, regionChoices } from "../mobile/watchData.js";

const item = {
  watch_checked_date: "2026-10-01",
  watch_providers: JSON.stringify({
    GB: { flatrate: ["Netflix"], rent: ["Apple TV"], buy: [], free: ["BBC iPlayer"], link: "https://tmdb/gb" },
    US: { flatrate: ["Max"], rent: [], buy: ["Amazon"], free: [], link: null },
  }),
};

describe("watchBuckets", () => {
  it("lists what the chosen country has, in Stream / Free / Rent / Buy order, skipping empty groups", () => {
    expect(watchBuckets(item, "GB")).toEqual([
      { type: "flatrate", label: "Stream", providers: ["Netflix"] },
      { type: "free", label: "Free", providers: ["BBC iPlayer"] },
      { type: "rent", label: "Rent", providers: ["Apple TV"] },
    ]);
    expect(watchBuckets(item, "US").map((b) => b.label)).toEqual(["Stream", "Buy"]);
  });
  it("is empty for a country with no data, or an item that was never checked", () => {
    expect(watchBuckets(item, "FR")).toEqual([]);
    expect(watchBuckets({ watch_providers: null }, "GB")).toEqual([]);
    expect(watchBuckets({ watch_providers: "{broken" }, "GB")).toEqual([]);
  });
});

describe("watchLink / watchChecked", () => {
  it("gives the country's TMDB page when there is one", () => {
    expect(watchLink(item, "GB")).toBe("https://tmdb/gb");
    expect(watchLink(item, "US")).toBeNull();
  });
  it("tells never-checked apart from checked-and-empty", () => {
    expect(watchChecked(item)).toBe(true);
    expect(watchChecked({ watch_checked_date: null })).toBe(false);
  });
});

describe("guessRegion", () => {
  it("takes the country from the phone's language setting when TMDB covers it", () => {
    expect(guessRegion("en-GB", ["GB", "US"])).toBe("GB");
    expect(guessRegion("pt_BR", ["BR"])).toBe("BR");
  });
  it("falls back when there is no country or it is not covered", () => {
    expect(guessRegion("en", ["GB", "US"])).toBe("US");
    expect(guessRegion("en-ZZ", ["GB", "US"])).toBe("US");
    expect(guessRegion(undefined, null, "GB")).toBe("GB");
  });
});

describe("regionChoices", () => {
  it("uses the named list, or bare codes if naming is not available", () => {
    expect(regionChoices(() => [{ code: "GB", name: "United Kingdom" }])).toEqual([{ code: "GB", name: "United Kingdom" }]);
    expect(regionChoices(() => { throw new Error("no Intl.DisplayNames"); }, ["GB", "US"])).toEqual([{ code: "GB", name: "GB" }, { code: "US", name: "US" }]);
  });
});
