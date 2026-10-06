import { describe, it, expect } from "vitest";
import { parseBggSearchHtml, buildBggDetails } from "@media-vault/core/bggParse";

const row = (id, name, year, thumb, kind = "boardgame") => `
<tr id="row_">
  <td class="collection_thumbnail"><a href="/${kind}/${id}/x"><img src="${thumb}" alt=""></a></td>
  <td class="collection_objectname"><div><a href="/${kind}/${id}/slug-${id}" class="primary">${name}</a> <span class="smallerfont dull">(${year})</span></div></td>
</tr>`;

describe("parseBggSearchHtml", () => {
  const html = `<table>${row(13, "Catan", 1995, "https://cf.geekdo-images.com/a.jpg")}${row(13, "Catan again", 1995, "x")}${row(822, "Carcassonne &amp; Co", 2000, "https://cf/b.jpg?x=1&amp;y=2", "boardgameexpansion")}</table>`;
  it("lists each game once with id, title and year, link and thumbnail", () => {
    const out = parseBggSearchHtml(html);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      platformId: "13", title: "Catan (1995)", type: "board game",
      storeUrl: "https://boardgamegeek.com/boardgame/13/slug-13", storeLabel: "BGG ↗", thumbnailUrl: "https://cf.geekdo-images.com/a.jpg",
    });
    expect(out[1]).toMatchObject({ platformId: "822", title: "Carcassonne & Co (2000)", thumbnailUrl: "https://cf/b.jpg?x=1&y=2" });
    expect(out[1].storeUrl).toContain("/boardgameexpansion/822/");
  });
  it("copes with a page with no results or junk", () => {
    expect(parseBggSearchHtml("<html>nothing</html>")).toEqual([]);
    expect(parseBggSearchHtml(null)).toEqual([]);
  });
  it("stops at 24 results", () => {
    const many = `<table>${Array.from({ length: 40 }, (_, i) => row(100 + i, `Game ${i}`, 2000, "t")).join("")}</table>`;
    expect(parseBggSearchHtml(many)).toHaveLength(24);
  });
});

describe("buildBggDetails", () => {
  const detail = { item: {
    name: "Catan", yearpublished: "1995", minplayers: "3", maxplayers: "4", minplaytime: "60", maxplaytime: "120", minage: "10",
    description: "<p>Trade &amp; build.</p>", imageurl: "https://img/c.jpg",
    links: { boardgamedesigner: [{ name: "Klaus Teuber" }], boardgamecategory: [{ name: "Negotiation" }] },
  } };
  const stats = { item: { stats: { avgweight: "2.32", baverage: "7.1234", usersrated: "120000" }, rankinfo: [{ rankobjecttype: "family", rank: "1" }, { rankobjecttype: "subtype", rank: "250" }] } };

  it("collects what desktop saves", () => {
    const d = buildBggDetails(detail, stats, 13);
    expect(d).toMatchObject({
      title: "Catan", media_type: "Board Game", platform_id: "13", bgg_url: "https://boardgamegeek.com/boardgame/13/", year: 1995,
      creator: "Klaus Teuber", genre: "Negotiation", player_count: "3–4", play_time: 120, complexity: 2.32,
      bgg_rating: 7.12, bgg_rating_count: 120000, bgg_rank: 250, notes: "Trade & build.", min_age: 10, _thumbnailUrl: "https://img/c.jpg",
    });
  });
  it("copes with missing stats, an unranked game and a single player count", () => {
    const d = buildBggDetails({ item: { name: "Solo", minplayers: "1", maxplayers: "1" } }, { item: { rankinfo: [{ rankobjecttype: "subtype", rank: "Not Ranked" }], stats: { baverage: "0" } } }, 7, "Tabletop");
    expect(d).toMatchObject({ media_type: "Tabletop", player_count: "1", bgg_rank: null, bgg_rating: null, complexity: null, play_time: null, notes: null });
    expect(buildBggDetails({ item: { name: "X" } }, null, 1).complexity).toBeNull();
  });
  it("says so when BGG has no such item", () => {
    expect(() => buildBggDetails({}, null, 1)).toThrow("Item not found on BGG");
    expect(() => buildBggDetails(null, null, 1)).toThrow("Item not found on BGG");
  });
});
