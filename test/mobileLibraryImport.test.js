import { describe, it, expect } from "vitest";
import { gameRows, reviewGameRows, quickRowFor } from "../mobile/libraryImport.js";

const steam = {
  owned: [{ appId: 10, title: "Half-Life", playtime: 125 }, { appId: 20, title: "Portal", playtime: 0 }],
  wishlist: [{ appId: 30, title: "Hades" }, { appId: 20, title: "Portal" }],
  wishlistError: null,
};

describe("gameRows (Steam)", () => {
  it("owned games come in as In Progress with hours played; wishlist ones as Wishlist, without repeats", () => {
    const { rows } = gameRows("steam", steam, "both");
    expect(rows.map((r) => [r.title, r.status, r.owned, r.runtime])).toEqual([
      ["Half-Life", "in-progress", true, 2], ["Portal", "in-progress", true, null], ["Hades", "wishlist", false, null],
    ]);
    expect(rows[0]).toMatchObject({ platform_id: "10", steam_url: "https://store.steampowered.com/app/10/" });
  });
  it("respects the mode", () => {
    expect(gameRows("steam", steam, "owned").rows).toHaveLength(2);
    expect(gameRows("steam", steam, "wishlist").rows.map((r) => r.title)).toEqual(["Hades"]);
  });
  it("reports a wishlist problem only when the wishlist was asked for", () => {
    const bad = { ...steam, wishlistError: "Wishlist is empty or not public." };
    expect(gameRows("steam", bad, "owned").wishlistError).toBeNull();
    const both = gameRows("steam", bad, "both");
    expect(both.wishlistError).toMatch(/not public/);
    expect(both.rows.every((r) => r.status === "in-progress")).toBe(true);
  });
});

describe("gameRows (GOG)", () => {
  it("prefixes the id, carries the year, and has no playtime", () => {
    const { rows } = gameRows("gog", { owned: [{ productId: 7, title: "Fallout 2", year: 1998 }], wishlist: [{ productId: 8, title: "Gwent", year: null }] }, "both");
    expect(rows).toEqual([
      { title: "Fallout 2", platform_id: "gog-7", status: "in-progress", owned: true, runtime: null, year: 1998 },
      { title: "Gwent", platform_id: "gog-8", status: "wishlist", owned: false, runtime: null, year: null },
    ]);
  });
});

describe("reviewGameRows / quickRowFor", () => {
  const library = [{ sync_id: "a", title: "Portal", media_type: "Game", platform_id: "20" }];
  it("flags and unticks what is already there (by store id or title)", () => {
    const rows = reviewGameRows(gameRows("steam", steam, "both").rows, library);
    expect(rows.find((r) => r.title === "Portal")).toMatchObject({ duplicate: true, selected: false });
    expect(rows.find((r) => r.title === "Hades")).toMatchObject({ duplicate: false, selected: true });
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });
  it("builds the insert from a row", () => {
    expect(quickRowFor({ title: "Half-Life", status: "in-progress", platform_id: "10", runtime: 2, steam_url: "u" })).toEqual({ title: "Half-Life", status: "in-progress", platform_id: "10", runtime: 2, steam_url: "u" });
    expect(quickRowFor({ title: "G", status: "wishlist", platform_id: "gog-1", runtime: null, year: 1998 })).toEqual({ title: "G", status: "wishlist", platform_id: "gog-1", year: 1998 });
  });
});

describe("GOG sign-in helpers shared with desktop", async () => {
  const { GOG_AUTH_URL, GOG_REDIRECT_URI } = await import("@media-vault/core/gogLibrary.js");
  const { extractGogCode } = await import("@media-vault/core/authValidation.js");
  const { GOG_WARNING } = await import("@media-vault/core/gogWarning.js");
  it("the sign-in page asks for a code and comes back to GOG's own redirect", () => {
    expect(GOG_AUTH_URL).toMatch(/^https:\/\/auth\.gog\.com\/auth\?client_id=\d+&redirect_uri=/);
    expect(GOG_AUTH_URL).toContain("response_type=code");
    expect(GOG_REDIRECT_URI).toBe("https://embed.gog.com/on_login_success?origin=client");
  });
  it("reads the one-time code off the redirect, and ignores everything else", () => {
    expect(extractGogCode("https://embed.gog.com/on_login_success?origin=client&code=ABCDEFGH123456")).toBe("ABCDEFGH123456");
    expect(extractGogCode("https://login.gog.com/login")).toBeNull();
    expect(extractGogCode("https://embed.gog.com/x?code=%E0%A4%A")).toBeNull();
  });
  it("carries the warning text both apps show before GOG can be turned on", () => {
    expect(GOG_WARNING.join(" ")).toMatch(/unofficial/);
    expect(GOG_WARNING.join(" ")).toMatch(/never seen by this app/);
  });
});
