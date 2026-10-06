import { describe, it, expect } from "vitest";
import chromeDetect from "../browser-extension/detect.js";
import fs from "node:fs";
const { detectFromTab } = chromeDetect;

const imdb = (title) => ({ url: "https://www.imdb.com/title/tt1160419/", title });

describe("detectFromTab", () => {
  it("IMDb movie: title and year", () => {
    expect(detectFromTab(imdb("Dune (2021) - IMDb"))).toEqual({ type: "Movie", query: "Dune", year: "2021", source: "IMDb" });
  });

  it("IMDb movie with the newer rating/genre suffix", () => {
    expect(detectFromTab(imdb("Oppenheimer (2023) ⭐ 8.3 | Biography, Drama, History"))).toMatchObject({ type: "Movie", query: "Oppenheimer", year: "2023" });
  });

  it("IMDb TV series uses the start year", () => {
    expect(detectFromTab(imdb("Breaking Bad (TV Series 2008–2013) - IMDb"))).toMatchObject({ type: "TV", query: "Breaking Bad", year: "2008" });
    expect(detectFromTab(imdb("Chernobyl (TV Mini Series 2019) - IMDb"))).toMatchObject({ type: "TV", query: "Chernobyl", year: "2019" });
  });

  it("IMDb title containing its own parentheses", () => {
    expect(detectFromTab(imdb("(500) Days of Summer (2009) - IMDb"))).toMatchObject({ query: "(500) Days of Summer", year: "2009" });
  });

  it("IMDb video game maps to Game with no year", () => {
    expect(detectFromTab(imdb("Cyberpunk 2077 (Video Game 2020) - IMDb"))).toMatchObject({ type: "Game", year: null });
  });

  it("IMDb episodes are ignored", () => {
    expect(detectFromTab(imdb("Ozymandias (TV Episode 2013) - IMDb"))).toBeNull();
  });

  it("IMDb title with no year falls back to Movie", () => {
    expect(detectFromTab(imdb("Some Upcoming Film - IMDb"))).toMatchObject({ type: "Movie", query: "Some Upcoming Film", year: null });
  });

  it("Steam, including a discount prefix", () => {
    const url = "https://store.steampowered.com/app/1091500/Cyberpunk_2077/";
    expect(detectFromTab({ url, title: "Cyberpunk 2077 on Steam" })).toEqual({ type: "Game", query: "Cyberpunk 2077", year: null, source: "Steam" });
    expect(detectFromTab({ url, title: "Save 65% on Cyberpunk 2077 on Steam" })).toMatchObject({ query: "Cyberpunk 2077" });
  });

  it("GOG", () => {
    const url = "https://www.gog.com/en/game/the_witcher_3_wild_hunt";
    expect(detectFromTab({ url, title: "The Witcher 3: Wild Hunt on GOG.com" })).toEqual({ type: "Game", query: "The Witcher 3: Wild Hunt", year: null, source: "GOG" });
  });

  it("ignores unrelated pages and non-title IMDb pages", () => {
    expect(detectFromTab({ url: "https://example.com/", title: "Example" })).toBeNull();
    expect(detectFromTab({ url: "https://www.imdb.com/chart/top/", title: "Top 250 - IMDb" })).toBeNull();
    expect(detectFromTab({ url: "not a url", title: "x" })).toBeNull();
  });

  it("the Firefox copy is identical to the Chrome copy", () => {
    expect(fs.readFileSync("browser-extension-firefox/detect.js", "utf8"))
      .toBe(fs.readFileSync("browser-extension/detect.js", "utf8"));
  });
});
