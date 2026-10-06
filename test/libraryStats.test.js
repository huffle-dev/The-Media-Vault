import { formatAverageRating } from "@media-vault/core/tokens/ratings.js";
import { describe, it, expect } from "vitest";
import {
  groupCompletedHistory, statusBreakdown, ratingHistogram, criticHistogram, mostPlayed, genreBreakdown,
} from "@media-vault/core/libraryStats.js";

const item = (over) => ({ title: "X", media_type: "Movie", status: "consumed", ...over });

describe("groupCompletedHistory", () => {
  it("groups completed items by month newest-first, undated last, ignoring other statuses", () => {
    const groups = groupCompletedHistory([
      item({ title: "A", date_consumed: "2026-09-02" }),
      item({ title: "B", date_consumed: "2026-09-20" }),
      item({ title: "C", date_consumed: "2025-12-31" }),
      item({ title: "D" }),
      item({ title: "Wish", status: "wishlist", date_consumed: "2026-09-25" }),
    ]);
    expect(groups.map((g) => g.title)).toEqual(["September 2026", "December 2025", "Undated"]);
    expect(groups[0].data.map((i) => i.title)).toEqual(["B", "A"]);
  });

  it("returns nothing when nothing is completed", () => {
    expect(groupCompletedHistory([item({ status: "wishlist" })])).toEqual([]);
  });
});

describe("statusBreakdown", () => {
  it("counts each status and averages ratings across completed and dropped", () => {
    const b = statusBreakdown([
      item({ status: "consumed", rating: 21 }), // display +10
      item({ status: "dropped", rating: 11 }), // display 0
      item({ status: "wishlist" }),
      item({ status: "in-progress" }),
      item({ status: "not-started" }),
    ]);
    expect(b).toMatchObject({ total: 5, consumed: 1, dropped: 1, wishlist: 1, inProgress: 1, notStarted: 1 });
    expect(b.avgRating).toBe("5.0");
  });

  it("has no average when nothing is rated", () => {
    expect(statusBreakdown([item({ status: "consumed" })]).avgRating).toBeNull();
  });
});

describe("histograms", () => {
  it("buckets personal ratings on the -10..+10 scale", () => {
    const h = ratingHistogram([item({ rating: 21 }), item({ rating: 21 }), item({ rating: 1 }), item({})]);
    expect(h).toHaveLength(21);
    expect(h.find((b) => b.display === 10).count).toBe(2);
    expect(h.find((b) => b.display === -10).count).toBe(1);
  });

  it("buckets critic ratings, rounded and clamped to 0..10", () => {
    const h = criticHistogram([
      item({ media_type: "Board Game", bgg_rating: 7.6 }),
      item({ media_type: "Music", discogs_rating: 4.5 }),
      item({ media_type: "Board Game" }),
    ]);
    expect(h.find((b) => b.value === 8).count).toBe(1);
    expect(h.find((b) => b.value === 9).count).toBe(1);
    expect(h.reduce((s, b) => s + b.count, 0)).toBe(2);
  });
});

describe("mostPlayed", () => {
  it("ranks games by hours and totals them", () => {
    const r = mostPlayed([
      item({ media_type: "Game", title: "A", runtime: 10 }),
      item({ media_type: "Game", title: "B", runtime: 40 }),
      item({ media_type: "Game", title: "Unplayed", runtime: 0 }),
      item({ media_type: "Movie", runtime: 500 }),
    ]);
    expect(r.ranked.map((i) => i.title)).toEqual(["B", "A"]);
    expect(r.totalHours).toBe(50);
  });
});

describe("genreBreakdown", () => {
  it("counts genres across types with per-type segments, most common first", () => {
    const rows = genreBreakdown([
      item({ media_type: "Movie", genre: "Action, Comedy" }),
      item({ media_type: "Game", genre: "Action" }),
      item({ media_type: "Custom", genre: "Ignored" }),
    ]);
    expect(rows[0].genre).toBe("Action");
    expect(rows[0].total).toBe(2);
    expect(rows[0].segments.map((s) => s.type).sort()).toEqual(["Game", "Movie"]);
    expect(rows.find((r) => r.genre === "Ignored")).toBeUndefined();
  });

  it("respects the limit", () => {
    const items = ["A", "B", "C"].map((g) => item({ genre: g }));
    expect(genreBreakdown(items, 2)).toHaveLength(2);
  });
});

describe("formatAverageRating", () => {
  it("shows a plus for a positive average, none for zero or below, and a dash for no ratings", () => {
    expect(formatAverageRating("4.6")).toBe("+4.6");
    expect(formatAverageRating("0.0")).toBe("0.0");
    expect(formatAverageRating("-1.2")).toBe("-1.2");
    expect(formatAverageRating(null)).toBe("—");
    expect(formatAverageRating("abc")).toBe("—");
  });
});
