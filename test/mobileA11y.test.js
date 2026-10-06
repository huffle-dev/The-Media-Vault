import { describe, it, expect } from "vitest";
import { describeItem, selectHint } from "../mobile/a11y.js";

describe("describeItem", () => {
  it("reads out title, type, status, rating and year", () => {
    expect(describeItem({ title: "Dune", media_type: "Book", status: "consumed", rating: 14, year: 2021 }))
      .toBe("Dune, Book, Consumed, your rating +3, 2021");
  });
  it("leaves out what is missing (0 is a real rating, not missing)", () => {
    expect(describeItem({ title: "Heat", media_type: "Movie", status: "in-progress", rating: 11 })).toBe("Heat, Movie, In Progress, your rating 0");
    expect(describeItem({ media_type: "Game" })).toBe("Untitled, Game");
  });
});

describe("selectHint", () => {
  it("tells you what a tap does in each mode", () => {
    expect(selectHint(false, false)).toMatch(/open/);
    expect(selectHint(true, false)).toMatch(/select/);
    expect(selectHint(true, true)).toMatch(/unselect/);
  });
});
