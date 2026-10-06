import { describe, it, expect } from "vitest";
import { reviewRows, rowsToAdd, confidenceLabel } from "../mobile/photoScan.js";

const library = [{ sync_id: "x", title: "Dune", media_type: "Book", year: 1965 }];

describe("reviewRows", () => {
  it("lists what was found, ticked, and unticks (but keeps) ones already in the library", () => {
    const rows = reviewRows([
      { title: "Dune", media_type: "Book", confidence: "high" },
      { title: "Hades", media_type: "Game" },
      { title: null, media_type: "Movie" },
    ], library);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ title: "Dune", duplicate: true, selected: false, confidence: "high" });
    expect(rows[1]).toMatchObject({ title: "Hades", media_type: "Game", duplicate: false, selected: true, confidence: "medium" });
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
  });
  it("copes with nothing found", () => expect(reviewRows([], library)).toEqual([]));
});

describe("rowsToAdd", () => {
  it("takes only ticked rows with a title, as Not Started", () => {
    const out = rowsToAdd([
      { selected: true, title: " Hades ", media_type: "Game" },
      { selected: false, title: "Skip", media_type: "Movie" },
      { selected: true, title: "   ", media_type: "Movie" },
    ]);
    expect(out).toEqual([{ mediaType: "Game", title: "Hades", quickRow: { title: "Hades", status: "not-started" } }]);
  });
});

describe("confidenceLabel", () => {
  it("says it in plain words", () => {
    expect(confidenceLabel("high")).toBe("sure");
    expect(confidenceLabel("low")).toBe("unsure");
    expect(confidenceLabel("medium")).toBe("probably");
  });
});
