import { describe, it, expect, vi } from "vitest";
import { webVideoKind } from "@media-vault/core/tokens/itemHelpers.js";
import { buildBaseFilter } from "@media-vault/core/tokens/filters.js";
import { isYoutubeSubscriptions, mapYoutubeSubscriptionRow } from "@media-vault/core/youtubeSubscriptions";
import createYoutubeService from "@media-vault/core/youtube";

const CH = "UC" + "a".repeat(22);

describe("webVideoKind", () => {
  it("tells channels, videos and playlists apart and ignores other types", () => {
    expect(webVideoKind({ media_type: "Web Video", platform_id: CH })).toBe("channel");
    expect(webVideoKind({ media_type: "Web Video", platform_id: "video-abc" })).toBe("video");
    expect(webVideoKind({ media_type: "Web Video", platform_id: "playlist-PL1" })).toBe("playlist");
    expect(webVideoKind({ media_type: "Web Video" })).toBe("channel"); // older item with no id
    expect(webVideoKind({ media_type: "Movie", platform_id: "video-abc" })).toBeNull();
    expect(webVideoKind(null)).toBeNull();
  });
});

describe("the Kind filter in buildBaseFilter", () => {
  const items = [
    { id: 1, title: "A channel", media_type: "Web Video", platform_id: CH, list_ids: [] },
    { id: 2, title: "A video", media_type: "Web Video", platform_id: "video-x", list_ids: [] },
    { id: 3, title: "A playlist", media_type: "Web Video", platform_id: "playlist-y", list_ids: [] },
    { id: 4, title: "A movie", media_type: "Movie", platform_id: "123", list_ids: [] },
  ];
  const tabs = [{ label: "Web Videos", includes: ["Web Video"] }, { label: "Movies", includes: ["Movie"] }];
  const base = { activeTab: "Web Videos", allTypeTabs: tabs, genre: "All Genres", ageRating: "All Age Ratings", platformFilter: "All Platforms", osConsole: "All OS & Consoles", listFilter: "", personalRating: "Any Rating", criticRating: "Any Critic Rating", search: "", hiddenFilter: "all" };
  const titles = (r) => r.map((i) => i.title);

  it("shows every kind by default and when set to all", () => {
    expect(titles(buildBaseFilter(items, base))).toEqual(["A channel", "A video", "A playlist"]);
    expect(titles(buildBaseFilter(items, { ...base, webKind: "all" }))).toEqual(["A channel", "A video", "A playlist"]);
  });
  it("narrows to one kind", () => {
    expect(titles(buildBaseFilter(items, { ...base, webKind: "video" }))).toEqual(["A video"]);
    expect(titles(buildBaseFilter(items, { ...base, webKind: "playlist" }))).toEqual(["A playlist"]);
    expect(titles(buildBaseFilter(items, { ...base, webKind: "channel" }))).toEqual(["A channel"]);
  });
  it("ignores an unknown value", () => {
    expect(buildBaseFilter(items, { ...base, webKind: "nonsense" })).toHaveLength(3);
  });
});

describe("Google Takeout subscriptions.csv", () => {
  const headers = ["Channel ID", "Channel URL", "Channel title"];
  it("is recognised by its three columns only", () => {
    expect(isYoutubeSubscriptions(headers)).toBe(true);
    expect(isYoutubeSubscriptions(["Channel ID", "Channel title"])).toBe(false);
    expect(isYoutubeSubscriptions(["Title", "Year"])).toBe(false);
  });
  it("maps a row to a Web Video channel", () => {
    expect(mapYoutubeSubscriptionRow({ "Channel ID": ` ${CH} `, "Channel URL": "http://www.youtube.com/channel/" + CH, "Channel title": " Kurzgesagt " })).toEqual({
      title: "Kurzgesagt", media_type: "Web Video", status: "not-started", platform_id: CH, creator: "Kurzgesagt", platform: "YouTube",
      url: "http://www.youtube.com/channel/" + CH,
    });
  });
  it("builds the URL when the column is empty and drops rows with no id or title", () => {
    expect(mapYoutubeSubscriptionRow({ "Channel ID": CH, "Channel URL": "", "Channel title": "X" }).url).toBe(`https://www.youtube.com/channel/${CH}`);
    expect(mapYoutubeSubscriptionRow({ "Channel ID": "", "Channel URL": "u", "Channel title": "X" }).title).toBeNull();
    expect(mapYoutubeSubscriptionRow({ "Channel ID": CH, "Channel URL": "u", "Channel title": "  " }).title).toBeNull();
  });
});

describe("getYoutubeChannelsBatch", () => {
  const ensureImage = vi.fn(async () => {});
  const yt = createYoutubeService({ joinPath: (...p) => p.join("/"), coverArtDir: () => "art", ensureImage });
  const channel = (id, subs) => ({ id, snippet: { title: "T" + id, publishedAt: "2015-01-01T00:00:00Z", description: "d", thumbnails: { high: { url: "http://t/" + id } } }, statistics: { subscriberCount: subs, videoCount: "10" } });

  it("asks once per 50 channels, returns fields by id, and downloads art only where asked", async () => {
    const calls = [];
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      const ids = new URL(url).searchParams.get("id").split(",");
      calls.push(ids.length);
      return { ok: true, json: async () => ({ items: ids.filter((i) => i !== "gone").map((i) => channel(i, "5000")) }) };
    }));
    const ids = Array.from({ length: 120 }, (_, i) => `c${i}`).concat(["gone", "c0"]); // duplicate + a deleted channel
    ensureImage.mockClear();
    const out = await yt.getYoutubeChannelsBatch(ids, "KEY", { artFor: ["c1", "c2"] });
    expect(calls).toEqual([50, 50, 21]); // 121 distinct ids: the duplicate is dropped
    expect(out.size).toBe(120);
    expect(out.has("gone")).toBe(false);
    expect(out.get("c5")).toMatchObject({ subscribers: "5K", video_count: 10, year: 2015, url: "https://www.youtube.com/channel/c5", cover_art_path: null });
    expect(out.get("c1").cover_art_path).toContain("youtube-c1.jpg");
    expect(ensureImage).toHaveBeenCalledTimes(2);
  });
  it("needs a key", async () => {
    await expect(yt.getYoutubeChannelsBatch(["c1"], "")).rejects.toThrow(/No YouTube Data API key/);
  });
});
