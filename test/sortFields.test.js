import { describe, it, expect } from "vitest";
import { SORT_OPTIONS } from "@media-vault/core/tokens/constants.js";
import { SORT_FIELDS, DIRECTION_LABELS, parseSort, buildSort, hasDirection, defaultDirection } from "@media-vault/core/tokens/sortFields.js";

describe("sort fields and directions (the phone's Sort sheet)", () => {
  it("cover every sort option exactly once, and invent none", () => {
    const all = SORT_FIELDS.flatMap((f) => Object.values(f.options));
    expect([...all].sort()).toEqual([...SORT_OPTIONS].sort());
    expect(new Set(all).size).toBe(all.length);
  });
  it("turn 21 options into 12 fields", () => {
    expect(SORT_OPTIONS.length).toBe(21);
    expect(SORT_FIELDS.length).toBe(12);
  });
  it("round-trip: every option parses to a field and direction that build the same option", () => {
    for (const option of SORT_OPTIONS) {
      const p = parseSort(option);
      expect(p, option).not.toBeNull();
      expect(buildSort(p.field, p.direction)).toBe(option);
    }
    expect(parseSort("nonsense")).toBeNull();
  });
  it("understand the arrows: ↓ is newest / highest first, ↑ is oldest / lowest first", () => {
    expect(parseSort("Rating ↓")).toEqual({ field: "rating", direction: "desc" });
    expect(parseSort("Year ↑")).toEqual({ field: "year", direction: "asc" });
    expect(parseSort("A–Z")).toEqual({ field: "title", direction: "asc" });
    expect(parseSort("Z–A")).toEqual({ field: "title", direction: "desc" });
  });
  it("offer a direction only where there are two, and fall back sensibly where there is one", () => {
    expect(hasDirection("rating")).toBe(true);
    expect(hasDirection("series")).toBe(false);
    expect(hasDirection("recent")).toBe(false);
    expect(buildSort("series", "desc")).toBe("Series");
    expect(buildSort("recent", "asc")).toBe("Recently Added");
    expect(buildSort("creator", "desc")).toBe("Creator A–Z");
    expect(buildSort("nope", "asc")).toBeNull();
  });
  it("start dates and numbers newest / highest first and text A → Z", () => {
    expect(defaultDirection("added")).toBe("desc");
    expect(defaultDirection("rating")).toBe("desc");
    expect(defaultDirection("title")).toBe("asc");
    expect(defaultDirection("genre")).toBe("asc");
  });
  it("have wording for every kind of direction", () => {
    for (const f of SORT_FIELDS.filter((x) => hasDirection(x.key))) expect(DIRECTION_LABELS[f.kind]).toHaveLength(2);
  });
});
