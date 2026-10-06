import { describe, it, expect, vi } from "vitest";
import { fetchRefreshDetails, buildRefreshPatch, saveRefresh, needsMovieInfo, needsCover, isChannel, runBatch } from "../mobile/refreshItem.js";

const svc = () => ({
  movie: { enrichMovieItem: vi.fn(async () => ({ year: 2021, genre: "SciFi" })) },
  discogs: { enrichMusicItem: vi.fn(async () => ({ label: "EMI" })) },
  podcast: { enrichPodcastItem: vi.fn(async () => ({ episode_count: 9 })) },
  igdb: { enrichGameItemViaIgdb: vi.fn(async () => ({ igdb_rating: 90 })) },
  openLibrary: { enrichBookItem: vi.fn(async () => ({ publisher: "Ace" })) },
  youtube: { getYoutubeDetails: vi.fn(async () => ({ subscribers: 5 })) },
  bggSearch: vi.fn(async () => [{ platformId: "13" }]),
  bggDetails: vi.fn(async () => ({ title: "Catan", _thumbnailUrl: "https://img/c.jpg" })),
  websiteInfo: vi.fn(async () => ({ title: "T", notes: "N", cover_art_url: "https://pic" })),
  coverFor: vi.fn(async () => "file:///c.jpg"),
});

describe("fetchRefreshDetails", () => {
  it("calls the lookup that matches the type", async () => {
    const s = svc();
    expect(await fetchRefreshDetails({ media_type: "Movie" }, { tmdb: "k" }, s)).toEqual({ year: 2021, genre: "SciFi" });
    expect(s.movie.enrichMovieItem).toHaveBeenCalledWith({ media_type: "Movie" }, "k");
    expect(await fetchRefreshDetails({ media_type: "Music" }, { discogs: "d" }, s)).toEqual({ label: "EMI" });
    expect(await fetchRefreshDetails({ media_type: "Podcast" }, {}, s)).toEqual({ episode_count: 9 });
    expect(await fetchRefreshDetails({ media_type: "Web Video", platform_id: "UC1" }, { youtube: "y" }, s)).toEqual({ subscribers: 5 });
  });
  it("Website re-reads its page; with no address it says so", async () => {
    const s = svc();
    expect(await fetchRefreshDetails({ media_type: "Website", url: "https://x.y" }, {}, s)).toMatchObject({ title: "T" });
    expect(s.websiteInfo).toHaveBeenCalledWith("https://x.y");
    await expect(fetchRefreshDetails({ media_type: "Website" }, {}, s)).rejects.toThrow(/No web address/);
  });
  it("Board Game uses its BGG id, or the first search match, and says so when there is none", async () => {
    const s = svc();
    await fetchRefreshDetails({ media_type: "Board Game", title: "Catan", platform_id: "13" }, {}, s);
    expect(s.bggSearch).not.toHaveBeenCalled();
    expect(s.bggDetails).toHaveBeenCalledWith("13", "Board Game");
    await fetchRefreshDetails({ media_type: "Board Game", title: "Catan" }, {}, s);
    expect(s.bggSearch).toHaveBeenCalledWith("Catan");
    s.bggSearch.mockResolvedValue([]);
    await expect(fetchRefreshDetails({ media_type: "Board Game", title: "Zzz" }, {}, s)).rejects.toThrow(/No board game found/);
  });
  it("Web Video without a key says what to do", async () => {
    await expect(fetchRefreshDetails({ media_type: "Web Video", platform_id: "UC1" }, {}, svc())).rejects.toThrow(/YouTube key/);
  });
  it("Game and Book fall back to the cover alone when there is no match or no key", async () => {
    const s = svc();
    s.igdb.enrichGameItemViaIgdb.mockRejectedValue(new Error("no match"));
    expect(await fetchRefreshDetails({ media_type: "Game" }, { igdbId: "i", igdbSecret: "s" }, s)).toEqual({ cover_art_path: "file:///c.jpg" });
    expect(await fetchRefreshDetails({ media_type: "Game" }, {}, s)).toEqual({ cover_art_path: "file:///c.jpg" });
    s.openLibrary.enrichBookItem.mockRejectedValue(new Error("none"));
    expect(await fetchRefreshDetails({ media_type: "Book" }, {}, s)).toEqual({ cover_art_path: "file:///c.jpg" });
    expect(await fetchRefreshDetails({ media_type: "Custom" }, {}, s)).toEqual({ cover_art_path: "file:///c.jpg" });
  });
});

describe("buildRefreshPatch", () => {
  const opts = (extra = {}) => ({ allowed: ["year", "genre", "notes"], sourceUrlFor: (p) => (p === "file:///c.jpg" ? "https://img/c.jpg" : null), ...extra });
  it("overwrites filled values on a resync but never with a blank, and only allowed columns", () => {
    const patch = buildRefreshPatch({ year: 2000, genre: "Old", notes: "mine" }, { year: 2021, genre: "", notes: null, secret: "x", cover_art_path: "file:///c.jpg" }, opts());
    expect(patch).toEqual({ year: 2021, cover_art_url: "https://img/c.jpg" });
  });
  it("a fill-in only fills blanks, and only takes a cover when there is none", () => {
    const patch = buildRefreshPatch({ year: 2000, genre: null, cover_art_url: "https://old" }, { year: 2021, genre: "SciFi", cover_art_path: "file:///c.jpg" }, opts({ overwrite: false }));
    expect(patch).toEqual({ genre: "SciFi" });
    expect(buildRefreshPatch({ cover_art_url: null }, { cover_art_path: "file:///c.jpg" }, opts({ overwrite: false }))).toEqual({ cover_art_url: "https://img/c.jpg" });
  });
  it("takes a page's own picture link directly", () => {
    expect(buildRefreshPatch({ cover_art_url: "https://old" }, { cover_art_url: "https://pic", notes: "N" }, { ...opts(), allowed: ["notes"] })).toEqual({ notes: "N", cover_art_url: "https://pic" });
    expect(buildRefreshPatch({ cover_art_url: "https://old" }, { cover_art_url: "https://pic" }, { ...opts(), allowed: [], overwrite: false })).toEqual({});
  });
  it("takes BoardGameGeek's picture link from its private field", () => {
    expect(buildRefreshPatch({}, { year: 1995, _thumbnailUrl: "https://img/c.jpg" }, { ...opts() })).toEqual({ year: 1995, cover_art_url: "https://img/c.jpg" });
    expect(buildRefreshPatch({ cover_art_url: "https://old" }, { _thumbnailUrl: "https://img/c.jpg" }, { ...opts(), overwrite: false })).toEqual({});
  });
  it("skips a cover whose source link is unknown, and passes an upgraded platform id through", () => {
    expect(buildRefreshPatch({}, { cover_art_path: "file:///other.jpg" }, opts())).toEqual({});
    expect(buildRefreshPatch({ platform_id: "tt1" }, { platform_id: "438" }, opts())).toEqual({ platform_id: "438" });
  });
});

describe("saveRefresh", () => {
  it("writes the patch and undo restores the old values (null for ones it never had)", async () => {
    const calls = [];
    const client = { from: () => ({ update: (patch) => ({ eq: async (c, id) => { calls.push({ patch, id }); return { error: null }; } }) }) };
    const { undo } = await saveRefresh(client, { sync_id: "s1", year: 2000 }, { year: 2021, genre: "SciFi" });
    expect(calls[0]).toMatchObject({ id: "s1", patch: { year: 2021, genre: "SciFi" } });
    await undo();
    expect(calls[1].patch).toMatchObject({ year: 2000, genre: null });
  });
  it("throws the server's message when it refuses", async () => {
    const client = { from: () => ({ update: () => ({ eq: async () => ({ error: { message: "nope" } }) }) }) };
    await expect(saveRefresh(client, { sync_id: "s" }, { year: 1 })).rejects.toThrow("nope");
  });
});

describe("batch helpers", () => {
  it("needsMovieInfo: Movie/TV with a gap, not tried today", () => {
    const full = { media_type: "Movie", year: 1, genre: "g", creator: "c", runtime: 1, content_rating: "PG", cover_art_url: "u" };
    expect(needsMovieInfo(full, "2026-10-05")).toBe(false);
    expect(needsMovieInfo({ ...full, runtime: null }, "2026-10-05")).toBe(true);
    expect(needsMovieInfo({ ...full, runtime: null, metadata_checked_date: "2026-10-05" }, "2026-10-05")).toBe(false);
    expect(needsMovieInfo({ ...full, runtime: null, metadata_checked_date: "2026-10-01" }, "2026-10-05")).toBe(true);
    expect(needsMovieInfo({ media_type: "Book", year: null }, "2026-10-05")).toBe(false);
  });
  it("needsCover and isChannel", () => {
    expect(needsCover({ cover_art_url: null })).toBe(true);
    expect(needsCover({ cover_art_url: "u" })).toBe(false);
    expect(isChannel({ media_type: "Web Video", platform_id: "UCabc" })).toBe(true);
    expect(isChannel({ media_type: "Web Video", platform_id: "video-x" })).toBe(false);
    expect(isChannel({ media_type: "Web Video", platform_id: "playlist-x" })).toBe(false);
    expect(isChannel({ media_type: "Movie", platform_id: "1" })).toBe(false);
  });
  it("runBatch respects the limit, counts failures, reports progress and can be cancelled", async () => {
    let running = 0, peak = 0;
    const seen = [];
    const res = await runBatch([1, 2, 3, 4, 5, 6], async (n) => { running++; peak = Math.max(peak, running); await Promise.resolve(); running--; if (n === 3) throw new Error("x"); }, { limit: 2, onProgress: (p) => seen.push(p.done) });
    expect(res).toEqual({ done: 6, failed: 1 });
    expect(peak).toBeLessThanOrEqual(2);
    expect(seen.at(-1)).toBe(6);
    let calls = 0;
    const cancelled = await runBatch([1, 2, 3, 4], async () => {}, { limit: 1, isCancelled: () => calls++ >= 2 });
    expect(cancelled.done).toBe(2);
  });
});
