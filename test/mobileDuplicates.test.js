import { describe, it, expect } from "vitest";
import { findDuplicate } from "../mobile/duplicates.js";

const lib = [
  { sync_id: "a", title: "Dune", media_type: "Movie", year: 1984, platform_id: "841" },
  { sync_id: "b", title: "Dune", media_type: "Movie", year: 2021, platform_id: "438631" },
  { sync_id: "c", title: "Hades", media_type: "Game", year: 2020, platform_id: "1145360" },
  { sync_id: "d", title: "Heat", media_type: "Movie", year: null, platform_id: "tt0113277" },
];

describe("findDuplicate", () => {
  it("matches the same source id within the same type", () => {
    expect(findDuplicate(lib, { title: "Whatever", media_type: "Game", platform_id: 1145360 }).sync_id).toBe("c");
    expect(findDuplicate(lib, { title: "Hades", media_type: "Movie", platform_id: "1145360" })).toBeNull(); // another type's id is not a match
  });
  it("matches an IMDb id wherever it was stored", () => {
    expect(findDuplicate(lib, { title: "x", media_type: "Movie", imdb_url: "https://www.imdb.com/title/tt0113277/" }).sync_id).toBe("d");
    expect(findDuplicate(lib, { title: "x", media_type: "Movie", platform_id: "tt0113277" }).sync_id).toBe("d");
  });
  it("matches a bare title only when the year agrees or is unknown", () => {
    expect(findDuplicate(lib, { title: "dune", media_type: "Movie", year: 2021 }).sync_id).toBe("b");
    expect(findDuplicate(lib, { title: "Dune", media_type: "Movie", year: 1999 })).toBeNull();
    expect(findDuplicate(lib, { title: "Dune", media_type: "Movie" }).sync_id).toBe("a"); // no year given: first title match
    expect(findDuplicate(lib, { title: "Heat", media_type: "Movie", year: 1995 }).sync_id).toBe("d"); // stored year unknown
  });
  it("never matches across types, and copes with an empty library", () => {
    expect(findDuplicate(lib, { title: "Hades", media_type: "Movie", year: 2020 })).toBeNull();
    expect(findDuplicate(null, { title: "x", media_type: "Movie" })).toBeNull();
  });
});
