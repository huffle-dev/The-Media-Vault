import { describe, it, expect } from "vitest";
import { normaliseWebsiteUrl, websiteCoverUrl, buildWebsiteItem, fetchWebsiteInfo } from "../mobile/websiteInfo.js";

describe("normaliseWebsiteUrl", () => {
  it("adds https:// and accepts ordinary public addresses", () => {
    expect(normaliseWebsiteUrl("example.com/post").href).toBe("https://example.com/post");
    expect(normaliseWebsiteUrl("  http://www.bbc.co.uk/news ").href).toBe("http://www.bbc.co.uk/news");
  });
  it("refuses empty input, other schemes and internal addresses", () => {
    expect(() => normaliseWebsiteUrl("")).toThrow(/Paste the address/);
    expect(() => normaliseWebsiteUrl("ftp://example.com/x")).toThrow(/http and https/);
    expect(() => normaliseWebsiteUrl("file:///etc/passwd")).toThrow(/http and https/);
    for (const bad of ["http://localhost:3000", "http://192.168.1.1/admin", "http://169.254.169.254/latest", "http://nas/share", "http://printer.local"]) {
      expect(() => normaliseWebsiteUrl(bad), bad).toThrow(/can't be fetched/);
    }
  });
});

describe("websiteCoverUrl", () => {
  const page = new URL("https://www.example.com/a/b");
  it("uses the page's own image, resolving a relative one", () => {
    expect(websiteCoverUrl("/img/x.jpg", page)).toBe("https://www.example.com/img/x.jpg");
    expect(websiteCoverUrl("https://cdn.example.net/y.png", page)).toBe("https://cdn.example.net/y.png");
  });
  it("falls back to the favicon when there is no image, or it points somewhere unsafe", () => {
    const fav = "https://www.google.com/s2/favicons?domain=www.example.com&sz=128";
    expect(websiteCoverUrl(null, page)).toBe(fav);
    expect(websiteCoverUrl("http://127.0.0.1/secret.png", page)).toBe(fav);
    expect(websiteCoverUrl("javascript:alert(1)", page)).toBe(fav);
  });
});

describe("buildWebsiteItem / fetchWebsiteInfo", () => {
  const html = '<title>T</title><meta property="og:title" content="Post"><meta property="og:image" content="/i.jpg">';
  it("shapes an item from the page", () => {
    expect(buildWebsiteItem(html, new URL("https://example.com/p"), "2026-10-05")).toMatchObject({
      title: "Post", media_type: "Website", site_name: "example.com", url: "https://example.com/p",
      cover_art_url: "https://example.com/i.jpg", metadata_checked_date: "2026-10-05",
    });
  });
  it("fetches, and says so when the page can't be read", async () => {
    const ok = await fetchWebsiteInfo("example.com/p", async () => ({ ok: true, text: async () => html }));
    expect(ok.title).toBe("Post");
    await expect(fetchWebsiteInfo("example.com/p", async () => ({ ok: false, status: 404 }))).rejects.toThrow("HTTP 404");
  });
});
