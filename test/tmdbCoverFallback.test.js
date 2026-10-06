import { describe, it, expect, vi } from "vitest";
import createMovieService from "@media-vault/core/movie";

// A fake TMDB: answers a search by its query text (and says whether a year filter was sent).
function tmdb(table) {
  const asked = [];
  vi.stubGlobal("fetch", vi.fn(async (url) => {
    const u = new URL(url);
    const q = u.searchParams.get("query");
    const hasYear = u.searchParams.has("year") || u.searchParams.has("first_air_date_year");
    asked.push({ q, hasYear });
    const hit = table[`${q}|${hasYear ? "y" : "n"}`];
    return { ok: true, json: async () => ({ results: hit ? [hit] : [] }) };
  }));
  return asked;
}

const run = (title, year = 2021, kind = "TV") => {
  const downloaded = [];
  const svc = createMovieService({ downloadImage: async (url, dest) => { downloaded.push(url); } });
  return svc.fetchMovieCoverArt(kind, title, year, "dest.jpg", "KEY").then((r) => ({ r, downloaded }), (e) => ({ error: e.message, downloaded }));
};

describe("fetchMovieCoverArt fallbacks", () => {
  it("uses the title as saved when TMDB knows it", async () => {
    const asked = tmdb({ "Dune|y": { title: "Dune", poster_path: "/dune.jpg" } });
    expect((await run("Dune", 2021, "Movie")).downloaded).toEqual(["https://image.tmdb.org/t/p/w780/dune.jpg"]);
    expect(asked).toHaveLength(1);
  });

  it("retries without the year when the year filter finds nothing", async () => {
    const asked = tmdb({ "Slow Horses|n": { name: "Slow Horses", poster_path: "/sh.jpg" } });
    const res = await run("Slow Horses", 2022);
    expect(res.downloaded).toHaveLength(1);
    expect(asked.map((a) => a.hasYear)).toEqual([true, false]);
  });

  it("falls back to the show name for 'Show: Episode' titles, when the result really is that show", async () => {
    tmdb({ "Mayor of Kingstown|n": { name: "Mayor of Kingstown", poster_path: "/mok.jpg" } });
    const res = await run("Mayor of Kingstown: The Mayor of Kingstown", 2021);
    expect(res.downloaded).toEqual(["https://image.tmdb.org/t/p/w780/mok.jpg"]);
  });

  it("does not take a different show's poster just because the first words match", async () => {
    tmdb({ "Cold War|n": { name: "The Cold War Years", poster_path: "/other.jpg" } });
    const res = await run("Cold War: Comrades", 2020);
    expect(res.error).toMatch(/found nothing/);
    expect(res.downloaded).toEqual([]);
  });

  it("splits on a spaced dash as well, and gives up cleanly when nothing matches", async () => {
    tmdb({ "AT&T|n": { title: "AT&T", poster_path: "/att.jpg" } });
    expect((await run("AT&T - Reporter", 2019, "Movie")).downloaded).toHaveLength(1);
    tmdb({});
    expect((await run("Totally Unknown Thing", null)).error).toMatch(/found nothing/);
  });

  it("still needs a key", async () => {
    const svc = createMovieService({ downloadImage: async () => {} });
    await expect(svc.fetchMovieCoverArt("TV", "X", 2020, "d", "")).rejects.toThrow(/No TMDB key/);
  });
});
