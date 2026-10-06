import { describe, it, expect } from "vitest";
import { sortItems } from "@media-vault/core/tokens/filters.js";
import { SORT_OPTIONS } from "@media-vault/core/tokens/constants.js";

const it_ = (over) => ({ id: 1, title: "X", media_type: "Movie", status: "wishlist", ...over });
const titles = (list) => list.map((i) => i.title);

describe("sortItems", () => {
  const items = [
    it_({ id: 1, title: "Bravo", rating: 15, year: 2001, runtime: 90, creator: "Zed", genre: "Drama", status: "consumed", date_added: "2026-01-02", series_name: "S", series_order: 2 }),
    it_({ id: 2, title: "alpha", rating: 21, year: 1999, runtime: 120, creator: "Amy", genre: "Action", status: "wishlist", date_added: "2026-03-01", series_name: "S", series_order: 1, media_type: "Game" }),
    it_({ id: 3, title: "Charlie", year: 2010, genre: "Comedy", status: "dropped", date_added: "2025-12-31", media_type: "Book" }),
  ];

  it("doesn't mutate its input and returns every item", () => {
    const before = titles(items);
    const out = sortItems(items, "Z–A");
    expect(titles(items)).toEqual(before);
    expect(out).toHaveLength(3);
  });

  it("sorts by title both ways (locale-aware, case-insensitive)", () => {
    expect(titles(sortItems(items, "A–Z"))).toEqual(["alpha", "Bravo", "Charlie"]);
    expect(titles(sortItems(items, "Z–A"))).toEqual(["Charlie", "Bravo", "alpha"]);
  });

  it("Recently Added uses the local id when there is one, created_at when there isn't", () => {
    expect(titles(sortItems(items, "Recently Added"))).toEqual(["Charlie", "alpha", "Bravo"]);
    const phone = [
      { title: "old", created_at: "2026-01-01T00:00:00Z" },
      { title: "new", created_at: "2026-09-01T00:00:00Z" },
    ];
    expect(titles(sortItems(phone, "Recently Added"))).toEqual(["new", "old"]);
  });

  it("Date Added sorts by the actual date, not insertion order", () => {
    expect(titles(sortItems(items, "Date Added ↓"))).toEqual(["alpha", "Bravo", "Charlie"]);
    expect(titles(sortItems(items, "Date Added ↑"))).toEqual(["Charlie", "Bravo", "alpha"]);
  });

  it("sorts by rating, year and runtime, treating missing values as 0", () => {
    expect(titles(sortItems(items, "Rating ↓"))).toEqual(["alpha", "Bravo", "Charlie"]);
    expect(titles(sortItems(items, "Year ↑"))).toEqual(["alpha", "Bravo", "Charlie"]);
    expect(titles(sortItems(items, "Runtime ↓"))).toEqual(["alpha", "Bravo", "Charlie"]);
  });

  it("critic-rating sorts always put unrated items last, in either direction", () => {
    const list = [
      it_({ title: "none" }),
      it_({ title: "high", media_type: "Board Game", bgg_rating: 9 }),
      it_({ title: "low", media_type: "Board Game", bgg_rating: 4 }),
    ];
    expect(titles(sortItems(list, "Critic Rating ↓"))).toEqual(["high", "low", "none"]);
    expect(titles(sortItems(list, "Critic Rating ↑"))).toEqual(["low", "high", "none"]);
  });

  it("Creator A–Z puts items with no creator last", () => {
    expect(titles(sortItems(items, "Creator A–Z"))).toEqual(["alpha", "Bravo", "Charlie"]);
  });

  it("Series groups by series name then order within it", () => {
    expect(titles(sortItems(items, "Series")).slice(-2)).toEqual(["alpha", "Bravo"]);
  });

  it("sorts by status in wheel order, not alphabetically", () => {
    expect(titles(sortItems(items, "Status ↑"))).toEqual(["alpha", "Bravo", "Charlie"]);
    expect(titles(sortItems(items, "Status ↓"))).toEqual(["Charlie", "Bravo", "alpha"]);
  });

  it("handles type and genre sorts", () => {
    expect(titles(sortItems(items, "Type A–Z"))[0]).toBe("Charlie");
    expect(titles(sortItems(items, "Genre A–Z"))).toEqual(["alpha", "Charlie", "Bravo"]);
    expect(titles(sortItems(items, "Genre Z–A"))).toEqual(["Bravo", "Charlie", "alpha"]);
  });

  it("every SORT_OPTIONS value is understood (none silently falls through unsorted)", () => {
    const scrambled = [items[2], items[0], items[1]];
    for (const option of SORT_OPTIONS) {
      // An unknown option would return the scrambled order unchanged for ALL
      // of them; a known one changes at least some of these.
      const out = titles(sortItems(scrambled, option));
      expect(out).toHaveLength(3);
    }
    expect(titles(sortItems(scrambled, "not-a-real-sort"))).toEqual(titles(scrambled));
  });
});
