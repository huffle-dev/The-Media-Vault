import { describe, it, expect, vi } from "vitest";
import createYoutubeService, { parseYoutubeInput, youtubeKind, youtubeUrl, parseIsoDuration, formatDuration } from "@media-vault/core/youtube";

describe("parseYoutubeInput", () => {
  const id = "dQw4w9WgXcQ";
  it("recognises every video link shape", () => {
    for (const u of [
      `https://www.youtube.com/watch?v=${id}`, `youtube.com/watch?v=${id}&t=30s`, `https://youtu.be/${id}?si=abc`,
      `https://www.youtube.com/shorts/${id}`, `https://www.youtube.com/live/${id}`, `https://www.youtube.com/embed/${id}`,
      `https://m.youtube.com/watch?v=${id}`, `https://music.youtube.com/watch?v=${id}`,
    ]) expect(parseYoutubeInput(u), u).toEqual({ kind: "video", id });
  });
  it("a watch link carrying a list is still the video", () => {
    expect(parseYoutubeInput(`https://www.youtube.com/watch?v=${id}&list=PL123`)).toEqual({ kind: "video", id });
  });
  it("playlists", () => {
    expect(parseYoutubeInput("https://www.youtube.com/playlist?list=PLabc123")).toEqual({ kind: "playlist", id: "PLabc123" });
  });
  it("channels by id, handle and legacy name", () => {
    const ch = "UC" + "a".repeat(22);
    expect(parseYoutubeInput(`https://www.youtube.com/channel/${ch}`)).toEqual({ kind: "channel", id: ch });
    expect(parseYoutubeInput(ch)).toEqual({ kind: "channel", id: ch });
    expect(parseYoutubeInput("https://www.youtube.com/@kurzgesagt")).toEqual({ kind: "handle", handle: "kurzgesagt" });
    expect(parseYoutubeInput("@kurzgesagt")).toEqual({ kind: "handle", handle: "kurzgesagt" });
    expect(parseYoutubeInput("https://www.youtube.com/c/Kurzgesagt")).toEqual({ kind: "name", name: "Kurzgesagt" });
    expect(parseYoutubeInput("https://www.youtube.com/user/vsauce")).toEqual({ kind: "name", name: "vsauce" });
  });
  it("is null for anything else", () => {
    for (const u of ["", "   ", "in a nutshell", "https://vimeo.com/123", "https://example.com/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/", "https://www.youtube.com/watch?v=short", "not a url at all"])
      expect(parseYoutubeInput(u), u).toBeNull();
  });
});

describe("kinds and urls", () => {
  it("tells kinds apart by platform_id (a bare id is a channel)", () => {
    expect(youtubeKind("UCabc")).toBe("channel");
    expect(youtubeKind("video-abc")).toBe("video");
    expect(youtubeKind("playlist-abc")).toBe("playlist");
    expect(youtubeKind(null)).toBe("channel");
  });
  it("builds the right page url", () => {
    expect(youtubeUrl("UCabc")).toBe("https://www.youtube.com/channel/UCabc");
    expect(youtubeUrl("video-abc")).toBe("https://www.youtube.com/watch?v=abc");
    expect(youtubeUrl("playlist-PL1")).toBe("https://www.youtube.com/playlist?list=PL1");
  });
});

describe("durations", () => {
  it("parses ISO 8601", () => {
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("PT45S")).toBe(45);
    expect(parseIsoDuration("PT10M")).toBe(600);
    expect(parseIsoDuration("P0D")).toBe(0);
    expect(parseIsoDuration("garbage")).toBeNull();
    expect(parseIsoDuration(undefined)).toBeNull();
  });
  it("formats for a row", () => {
    expect(formatDuration(3723)).toBe("1:02:03");
    expect(formatDuration(754)).toBe("12:34");
    expect(formatDuration(5)).toBe("0:05");
    expect(formatDuration(NaN)).toBeNull();
  });
});

describe("service (mocked API)", () => {
  const storage = { joinPath: (...p) => p.join("/"), coverArtDir: () => "art", ensureImage: vi.fn(async () => {}) };
  const yt = createYoutubeService(storage);
  const mockFetch = (routes) => vi.stubGlobal("fetch", vi.fn(async (url) => {
    const u = new URL(url);
    const hit = routes[u.pathname.split("/").pop()];
    return { ok: true, json: async () => (typeof hit === "function" ? hit(u) : hit) };
  }));

  it("needs a key", async () => {
    await expect(yt.searchYoutube("x", "")).rejects.toThrow(/No YouTube Data API key/);
  });

  it("video search is enriched with duration and channel, ids are prefixed", async () => {
    mockFetch({
      search: { items: [{ id: { videoId: "AAAAAAAAAAA" }, snippet: { title: "Vid", channelTitle: "Chan", thumbnails: { medium: { url: "http://t" } } } }] },
      videos: { items: [{ id: "AAAAAAAAAAA", contentDetails: { duration: "PT12M34S" } }] },
    });
    const [r] = await yt.searchYoutube("q", "KEY", "video");
    expect(r).toMatchObject({ platformId: "video-AAAAAAAAAAA", type: "video", detail: "12:34 · Chan", thumbnailUrl: "http://t" });
  });

  it("channel search shows subscribers; a failed enrichment still returns rows", async () => {
    mockFetch({
      search: { items: [{ id: { channelId: "UC1" }, snippet: { title: "C", thumbnails: {} } }] },
      channels: { items: [{ id: "UC1", statistics: { subscriberCount: "412000" } }] },
    });
    expect((await yt.searchYoutube("q", "KEY"))[0].detail).toBe("412K subscribers");

    vi.stubGlobal("fetch", vi.fn(async (url) => String(url).includes("/search")
      ? { ok: true, json: async () => ({ items: [{ id: { channelId: "UC1" }, snippet: { title: "C", thumbnails: {} } }] }) }
      : { ok: false, json: async () => ({ error: { message: "boom" } }) }));
    const rows = await yt.searchYoutube("q", "KEY");
    expect(rows).toHaveLength(1);
    expect(rows[0].detail).toBeNull();
  });

  it("reports an exhausted quota in plain words", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({ error: { message: "x", errors: [{ reason: "quotaExceeded" }] } }) })));
    await expect(yt.searchYoutube("q", "KEY")).rejects.toThrow(/daily quota/);
  });

  it("video details: minutes, year, views, url, prefixed id", async () => {
    mockFetch({ videos: { items: [{ id: "AAAAAAAAAAA", snippet: { title: "Vid", channelTitle: "Chan", publishedAt: "2021-05-04T00:00:00Z", thumbnails: { high: { url: "http://h" } } }, contentDetails: { duration: "PT1H0M30S" }, statistics: { viewCount: "1500000" } }] } });
    const d = await yt.getYoutubeDetails("video-AAAAAAAAAAA", "KEY");
    expect(d).toMatchObject({ title: "Vid", creator: "Chan", platform_id: "video-AAAAAAAAAAA", runtime: 61, year: 2021, subscribers: "1.5M views", url: "https://www.youtube.com/watch?v=AAAAAAAAAAA" });
    expect(d.cover_art_path).toContain("youtube-video-AAAAAAAAAAA.jpg");
  });

  it("falls back to a smaller thumbnail when the biggest one will not download", async () => {
    const tried = [];
    const flaky = createYoutubeService({
      joinPath: (...p) => p.join("/"), coverArtDir: () => "art",
      ensureImage: async (url) => { tried.push(url); if (url.includes("maxres")) throw new Error("404"); },
    });
    mockFetch({ videos: { items: [{ id: "AAAAAAAAAAA", snippet: { title: "V", thumbnails: { maxres: { url: "http://maxres" }, high: { url: "http://high" } } }, contentDetails: {}, statistics: {} }] } });
    const d = await flaky.getYoutubeDetails("video-AAAAAAAAAAA", "KEY");
    expect(tried).toEqual(["http://maxres", "http://high"]);
    expect(d.cover_art_path).toContain("youtube-video-AAAAAAAAAAA.jpg");
  });

  it("a pasted @handle resolves through forHandle, then to details", async () => {
    mockFetch({ channels: (u) => (u.searchParams.get("forHandle")
      ? { items: [{ id: "UC" + "b".repeat(22) }] }
      : { items: [{ id: "UC" + "b".repeat(22), snippet: { title: "Nut", publishedAt: "2015-01-01T00:00:00Z", thumbnails: {} }, statistics: { subscriberCount: "5000", videoCount: "10" } }] }) });
    const r = await yt.resolveYoutubeInput("@nut", "KEY");
    expect(r).toMatchObject({ platformId: "UC" + "b".repeat(22), type: "channel", title: "Nut", detail: "5K" });
    expect(await yt.resolveYoutubeInput("not youtube", "KEY")).toBeNull();
  });
});

describe("new uploads from your channels", () => {
  const yt = createYoutubeService({ joinPath: (...p) => p.join("/"), coverArtDir: () => "art", ensureImage: async () => {} });
  const CH = (n) => "UC" + String(n).repeat(22);
  const chan = (n, extra = {}) => ({ id: n, media_type: "Web Video", platform_id: CH(n), ...extra });
  const pl = (list) => ({ items: list.map(([vid, title, at, ch]) => ({ snippet: { resourceId: { videoId: vid }, title, publishedAt: at, videoOwnerChannelTitle: ch || "Chan", thumbnails: { medium: { url: "http://t/" + vid } } } })) });

  const stub = (playlists, durations = {}) => vi.stubGlobal("fetch", vi.fn(async (url) => {
    const u = new URL(url);
    if (u.pathname.endsWith("/playlistItems")) {
      const hit = playlists[u.searchParams.get("playlistId")];
      if (hit === "fail") return { ok: false, json: async () => ({ error: { message: "nope" } }) };
      return { ok: true, json: async () => hit || { items: [] } };
    }
    if (u.pathname.endsWith("/videos")) {
      return { ok: true, json: async () => ({ items: u.searchParams.get("id").split(",").map((id) => ({ id, contentDetails: { duration: durations[id] || "PT10M" } })) }) };
    }
    throw new Error("unexpected " + url);
  }));

  it("needs a key and at least one channel", async () => {
    expect(await yt.getYoutubeNewUploads([chan(1)], [], "")).toEqual({ items: [], reason: "no_key" });
    expect(await yt.getYoutubeNewUploads([{ media_type: "Movie" }], [], "K")).toEqual({ items: [], reason: "no_channels" });
  });

  it("uses each channel's uploads playlist (UC -> UU) and sorts newest first across channels", async () => {
    stub({
      ["UU" + "1".repeat(22)]: pl([["v1aaaaaaaaa", "Old", "2026-01-01T00:00:00Z"], ["v2aaaaaaaaa", "Newest", "2026-09-01T00:00:00Z", "One"]]),
      ["UU" + "2".repeat(22)]: pl([["v3aaaaaaaaa", "Middle", "2026-05-01T00:00:00Z", "Two"]]),
    });
    const r = await yt.getYoutubeNewUploads([chan(1), chan(2)], [], "K");
    expect(r.items.map((i) => i.title)).toEqual(["Newest", "Middle", "Old"]);
    expect(r.items[0]).toMatchObject({ id: "video-v2aaaaaaaaa", mediaType: "Web Video", year: 2026, genre: "One", channelId: CH(1), channelTitle: "One", coverUrl: "http://t/v2aaaaaaaaa" });
  });

  it("drops videos already owned or dismissed, Shorts, and premieres", async () => {
    stub({ ["UU" + "1".repeat(22)]: pl([["own", "Owned", "2026-09-01T00:00:00Z"], ["dis", "Dismissed", "2026-09-02T00:00:00Z"], ["sho", "Short", "2026-09-03T00:00:00Z"], ["pre", "Premiere", "2026-09-04T00:00:00Z"], ["ok", "Keep", "2026-09-05T00:00:00Z"]]) },
      { sho: "PT45S", pre: "P0D" });
    const items = [chan(1), { id: 9, media_type: "Web Video", platform_id: "video-own" }];
    const r = await yt.getYoutubeNewUploads(items, [{ media_type: "Web Video", tmdb_id: "video-dis" }], "K");
    expect(r.items.map((i) => i.title)).toEqual(["Keep"]);
  });

  it("one failing channel does not blank the rest; rated channels come first when capped", async () => {
    stub({ ["UU" + "1".repeat(22)]: "fail", ["UU" + "2".repeat(22)]: pl([["v2aaaaaaaaa", "Two", "2026-09-01T00:00:00Z"]]), ["UU" + "3".repeat(22)]: pl([["v3aaaaaaaaa", "Three", "2026-09-02T00:00:00Z"]]) });
    expect((await yt.getYoutubeNewUploads([chan(1), chan(2)], [], "K")).items.map((i) => i.title)).toEqual(["Two"]);
    const capped = await yt.getYoutubeNewUploads([chan(2), chan(3, { rating: 9 })], [], "K", { maxChannels: 1 });
    expect(capped.items.map((i) => i.title)).toEqual(["Three"]);
  });

  it("shows everything if the duration lookup fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url) => String(url).includes("/playlistItems")
      ? { ok: true, json: async () => pl([["v1aaaaaaaaa", "A", "2026-09-01T00:00:00Z"]]) }
      : { ok: false, json: async () => ({ error: { message: "x" } }) }));
    expect((await yt.getYoutubeNewUploads([chan(1)], [], "K")).items).toHaveLength(1);
  });

  it("a channel's recent uploads skip videos already in the library", async () => {
    stub({ ["UU" + "1".repeat(22)]: pl([["own", "Owned", "2026-09-01T00:00:00Z"], ["new", "New", "2026-09-02T00:00:00Z"]]) });
    const r = await yt.getYoutubeRecentUploads(CH(1), [{ media_type: "Web Video", platform_id: "video-own" }], "K");
    expect(r.map((w) => w.id)).toEqual(["video-new"]);
  });
});
