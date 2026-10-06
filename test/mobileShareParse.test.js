import { describe, it, expect } from "vitest";
import { parseShared } from "../mobile/shareParse.js";

describe("parseShared", () => {
  it("IMDb: reads the title and year from the shared text, and the kind from it", () => {
    expect(parseShared({ text: "Dune (2021)\nhttps://m.imdb.com/title/tt1160419/" }))
      .toEqual({ mediaType: "Movie", query: "Dune", year: "2021", source: "IMDb" });
    expect(parseShared({ text: "Breaking Bad (TV Series 2008–2013)\nhttps://www.imdb.com/title/tt0903747/" }))
      .toMatchObject({ mediaType: "TV", query: "Breaking Bad", year: "2008" });
    expect(parseShared({ text: "Hades (Video Game 2020)\nhttps://www.imdb.com/title/tt1234567/" }))
      .toMatchObject({ mediaType: "Game", query: "Hades", year: null });
  });
  it("IMDb: with only a link there is nothing to search for", () => {
    expect(parseShared({ text: "https://m.imdb.com/title/tt1160419/" })).toBeNull();
  });
  it("Steam: uses the shared text, or the name in the link", () => {
    expect(parseShared({ text: "Check out Hades on Steam https://store.steampowered.com/app/1145360/Hades/" }))
      .toMatchObject({ mediaType: "Game", query: "Hades", source: "Steam" });
    expect(parseShared({ webUrl: "https://store.steampowered.com/app/1145360/Hades_II/" }))
      .toMatchObject({ mediaType: "Game", query: "Hades II" });
  });
  it("Audible and Goodreads: an audiobook and a book, title before ' by '", () => {
    expect(parseShared({ webUrl: "https://www.audible.com/pd/Project-Hail-Mary-Audiobook/B08G9PRS1K" }))
      .toMatchObject({ mediaType: "Audiobook", query: "Project Hail Mary Audiobook" });
    expect(parseShared({ text: "Dune by Frank Herbert\nhttps://www.goodreads.com/book/show/234225.Dune" }))
      .toMatchObject({ mediaType: "Book", query: "Dune", source: "Goodreads" });
  });
  it("YouTube: keeps the link, which Add's Web Video search already understands", () => {
    expect(parseShared({ webUrl: "https://youtu.be/abc123XYZ_-" }))
      .toMatchObject({ mediaType: "Web Video", source: "YouTube" });
  });
  it("GOG and Discogs", () => {
    expect(parseShared({ webUrl: "https://www.gog.com/en/game/the_witcher_3_wild_hunt" })).toMatchObject({ mediaType: "Game", query: "the witcher 3 wild hunt" });
    expect(parseShared({ webUrl: "https://www.discogs.com/release/123-Pink-Floyd-The-Wall" })).toMatchObject({ mediaType: "Music", source: "Discogs" });
  });
  it("returns null for anything else, or for text with no link", () => {
    expect(parseShared({ text: "https://example.com/some/page" })).toBeNull();
    expect(parseShared({ text: "just some words" })).toBeNull();
    expect(parseShared({})).toBeNull();
    expect(parseShared({ webUrl: "not a url" })).toBeNull();
  });
});
