import { describe, it, expect } from "vitest";
import { externalRatingStats, externalLinks, sourceLabel, whereToWatch, parseTracklist } from "../mobile/profileData.js";
import { statusLabel } from "../mobile/format.js";

describe("externalRatingStats", () => {
  it("movie: lists IMDb/RT and skips TMDB when others exist", () => {
    const s = externalRatingStats({ media_type: "Movie", imdb_rating: 8.1, imdb_votes: 12345, rotten_tomatoes_rating: 90, tmdb_rating: 7 });
    expect(s.map((x) => x.label)).toEqual(["IMDb", "Rotten Tomatoes"]);
    expect(s[0].sub).toBe(`${(12345).toLocaleString()} votes`);
  });
  it("movie: falls back to TMDB alone", () => {
    expect(externalRatingStats({ media_type: "TV", tmdb_rating: 7.5 }).map((x) => x.label)).toEqual(["TMDB"]);
  });
  it("keeps a zero rating", () => {
    expect(externalRatingStats({ media_type: "Movie", imdb_rating: 0 })).toHaveLength(1);
  });
  it("board game, book vs audiobook, music", () => {
    expect(externalRatingStats({ media_type: "Board Game", bgg_rating: 7.2, bgg_rank: 10 })[0].sub).toBe("#10 Overall");
    expect(externalRatingStats({ media_type: "Audiobook", platform_id: "audible-B01", openlibrary_rating: 4.5 })[0].label).toBe("Audible");
    expect(externalRatingStats({ media_type: "Book", platform_id: "OL1W", openlibrary_rating: 4 })[0].value).toBe("4.00");
    expect(externalRatingStats({ media_type: "Music", discogs_rating: 4.2 })[0].label).toBe("Discogs");
  });
  it("nothing for types or items without data", () => {
    expect(externalRatingStats({ media_type: "Podcast" })).toEqual([]);
    expect(externalRatingStats({ media_type: "Game" })).toEqual([]);
  });
});

describe("externalLinks", () => {
  const keys = (i) => externalLinks(i).map((l) => l.key);
  it("only links the item has a value for", () => {
    expect(keys({ media_type: "Movie", imdb_url: "u" })).toEqual(["imdb"]);
    expect(keys({ media_type: "Movie" })).toEqual([]);
    expect(keys({ media_type: "Game", steam_url: "s", igdb_url: "i" })).toEqual(["steam", "igdb"]);
  });
  it("audible vs open library by platform id", () => {
    expect(externalLinks({ media_type: "Audiobook", platform_id: "audible-B01X" })[0].href).toBe("https://www.audible.com/pd/B01X");
    expect(externalLinks({ media_type: "Book", platform_id: "OL1W" })[0].href).toBe("https://openlibrary.org/works/OL1W");
  });
  it("spotify search encodes creator and title", () => {
    const l = externalLinks({ media_type: "Music", title: "A&B", creator: "X Y" })[0];
    expect(l.href).toBe("https://open.spotify.com/search/" + encodeURIComponent("X Y A&B"));
  });
  it("no MTG links any more", () => {
    expect(externalLinks({ media_type: "MTG", platform_id: "x" })).toEqual([]);
  });
});

describe("sourceLabel", () => {
  it("names the source by type", () => {
    expect(sourceLabel({ media_type: "Movie", platform_id: "1" })).toBe("TMDB");
    expect(sourceLabel({ media_type: "Game", platform_id: "igdb-5" })).toBe("IGDB");
    expect(sourceLabel({ media_type: "Game", platform_id: "570" })).toBe("Steam");
    expect(sourceLabel({ media_type: "Audiobook", platform_id: "audible-1" })).toBe("Audible");
  });
  it("null without a platform id or for unknown types", () => {
    expect(sourceLabel({ media_type: "Movie" })).toBeNull();
    expect(sourceLabel({ media_type: "MTG", platform_id: "x" })).toBeNull();
  });
});

describe("whereToWatch, parseTracklist, statusLabel", () => {
  it("whereToWatch skips blank providers", () => {
    expect(whereToWatch({ watch_flatrate: "Netflix", watch_rent: "  ", watch_buy: null })).toEqual([["Stream", "Netflix"]]);
  });
  it("parseTracklist tolerates bad input", () => {
    expect(parseTracklist(null)).toEqual([]);
    expect(parseTracklist("not json")).toEqual([]);
    expect(parseTracklist('{"a":1}')).toEqual([]);
    expect(parseTracklist('[{"title":"T"}]')).toEqual([{ title: "T" }]);
  });
  it("statusLabel title-cases hyphenated statuses", () => {
    expect(statusLabel("not-started")).toBe("Not Started");
    expect(statusLabel("wishlist")).toBe("Wishlist");
    expect(statusLabel(null)).toBe("");
  });
});

describe("square art", () => {
  it("Web Video is square like Audiobook", async () => {
    const { isSquareArt } = await import("@media-vault/core/tokens/itemHelpers.js");
    expect(isSquareArt("Web Video")).toBe(true);
    expect(isSquareArt("Audiobook")).toBe(true);
    expect(isSquareArt("Movie")).toBe(false);
  });
});

describe("wide art", () => {
  it("only video and playlist thumbnails are 16:9", async () => {
    const { isWideArt } = await import("@media-vault/core/tokens/itemHelpers.js");
    expect(isWideArt({ media_type: "Web Video", platform_id: "video-abc" })).toBe(true);
    expect(isWideArt({ media_type: "Web Video", platform_id: "playlist-PL1" })).toBe(true);
    expect(isWideArt({ media_type: "Web Video", platform_id: "UC" + "a".repeat(22) })).toBe(false);
    expect(isWideArt({ media_type: "Movie", platform_id: "video-abc" })).toBe(false);
    expect(isWideArt({ media_type: "Web Video" })).toBe(false);
    expect(isWideArt(null)).toBe(false);
  });
});
