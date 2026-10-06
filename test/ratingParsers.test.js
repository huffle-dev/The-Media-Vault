import { describe, it, expect } from "vitest";
import ratingParsers from "@media-vault/core/ratingParsers";
const { parseTmdbRating } = ratingParsers;

describe("parseTmdbRating", () => {
  it("extracts rating + vote count (real shape from The Father, TMDB id 600354)", () => {
    const data = { vote_average: 8.09, vote_count: 3704 };
    expect(parseTmdbRating(data)).toEqual({
      criticRating: "TMDB 8.1/10 (3,704 votes)",
      tmdb_rating: 8.1,
      tmdb_votes: 3704,
    });
  });

  it("omits the vote count from the display string when absent", () => {
    const data = { vote_average: 7.5, vote_count: 0 };
    const result = parseTmdbRating(data);
    expect(result.criticRating).toBe("TMDB 7.5/10");
    expect(result.tmdb_votes).toBeNull();
  });
});
