import { describe, it, expect, vi } from "vitest";
import { needsWatchCheck, checkWatchProviders } from "../mobile/watchCheck.js";

describe("needsWatchCheck", () => {
  const base = { media_type: "Movie", platform_id: "123" };
  it("wants never-checked and stale items, not fresh ones", () => {
    expect(needsWatchCheck(base, "2026-10-05")).toBe(true);
    expect(needsWatchCheck({ ...base, watch_checked_date: "2026-09-20" }, "2026-10-05")).toBe(true);
    expect(needsWatchCheck({ ...base, watch_checked_date: "2026-10-03" }, "2026-10-05")).toBe(false);
    expect(needsWatchCheck({ ...base, watch_checked_date: "2026-10-05" }, "2026-10-05")).toBe(false);
  });
  it("only Movie/TV with an id", () => {
    expect(needsWatchCheck({ media_type: "Book", platform_id: "1" }, "2026-10-05")).toBe(false);
    expect(needsWatchCheck({ media_type: "TV" }, "2026-10-05")).toBe(false);
    expect(needsWatchCheck({ media_type: "TV", platform_id: "9" }, "2026-10-05")).toBe(true);
  });
});

describe("checkWatchProviders", () => {
  const client = (error = null) => {
    const calls = [];
    return { calls, from: () => ({ update: (patch) => ({ eq: async (c, id) => { calls.push({ patch, id }); return { error }; } }) }) };
  };
  const movie = () => ({
    resolveTmdbIdFromImdb: vi.fn(async () => "438631"),
    fetchWatchProviders: vi.fn(async () => ({ GB: { flatrate: ["Netflix"] } })),
  });

  it("saves every country's providers and the date", async () => {
    const c = client(), m = movie();
    const patch = await checkWatchProviders({ client: c, movie: m, tmdbKey: "k", item: { sync_id: "s", media_type: "Movie", platform_id: "42" }, today: "2026-10-05" });
    expect(m.resolveTmdbIdFromImdb).not.toHaveBeenCalled();
    expect(m.fetchWatchProviders).toHaveBeenCalledWith("Movie", "42", "k");
    expect(JSON.parse(patch.watch_providers)).toEqual({ GB: { flatrate: ["Netflix"] } });
    expect(c.calls[0]).toMatchObject({ id: "s", patch: { platform_id: "42", watch_checked_date: "2026-10-05" } });
  });
  it("turns an IMDb id into the TMDB id and keeps it", async () => {
    const c = client(), m = movie();
    const patch = await checkWatchProviders({ client: c, movie: m, tmdbKey: "k", item: { sync_id: "s", media_type: "Movie", platform_id: "tt0113277" } });
    expect(patch.platform_id).toBe("438631");
    expect(m.fetchWatchProviders).toHaveBeenCalledWith("Movie", "438631", "k");
  });
  it("says what is wrong: no key, no id, no match, server refusal", async () => {
    const item = { sync_id: "s", media_type: "Movie", platform_id: "42" };
    await expect(checkWatchProviders({ client: client(), movie: movie(), tmdbKey: null, item })).rejects.toThrow(/TMDB key/);
    await expect(checkWatchProviders({ client: client(), movie: movie(), tmdbKey: "k", item: { ...item, platform_id: null } })).rejects.toThrow(/no TMDB link/);
    const m = movie(); m.resolveTmdbIdFromImdb.mockResolvedValue(null);
    await expect(checkWatchProviders({ client: client(), movie: m, tmdbKey: "k", item: { ...item, platform_id: "tt1" } })).rejects.toThrow(/No TMDB match/);
    await expect(checkWatchProviders({ client: client({ message: "denied" }), movie: movie(), tmdbKey: "k", item })).rejects.toThrow("denied");
  });
});
