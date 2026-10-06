import { describe, it, expect } from "vitest";
import discogsParser from "@media-vault/core/discogsParser";
const { parseDiscogsSearchResult, parseDiscogsTracklist, parseDiscogsRelease } = discogsParser;

describe("parseDiscogsSearchResult", () => {
  it("extracts platformId/title/thumbnail/storeUrl (real shape, unauthenticated search)", () => {
    const r = {
      id: 9287809,
      year: "2016",
      title: "Pink Floyd - The Dark Side Of The Moon",
      uri: "/release/9287809-Pink-Floyd-The-Dark-Side-Of-The-Moon",
      thumb: "",
      cover_image: "",
    };
    expect(parseDiscogsSearchResult(r)).toEqual({
      platformId: "9287809",
      title: "Pink Floyd - The Dark Side Of The Moon (2016)",
      thumbnailUrl: null,
      storeUrl: "https://www.discogs.com/release/9287809-Pink-Floyd-The-Dark-Side-Of-The-Moon",
    });
  });

  it("uses thumb when present (authenticated search)", () => {
    const r = { id: 1, title: "Some Album", thumb: "https://i.discogs.com/thumb.jpg" };
    expect(parseDiscogsSearchResult(r).thumbnailUrl).toBe("https://i.discogs.com/thumb.jpg");
  });

  it("returns null for a result missing an id or title rather than erroring", () => {
    expect(parseDiscogsSearchResult({ title: "No id" })).toBeNull();
    expect(parseDiscogsSearchResult({ id: 1 })).toBeNull();
    expect(parseDiscogsSearchResult(null)).toBeNull();
  });
});

describe("parseDiscogsTracklist", () => {
  it("keeps only track-type rows (real shape from Pink Floyd - Dark Side Of The Moon, release 6184733)", () => {
    const tracklist = [
      { position: "1-a", type_: "track", title: "Speak To Me", duration: "" },
      { position: "1-b", type_: "track", title: "Breathe", duration: "" },
      { position: "2", type_: "track", title: "On The Run", duration: "" },
    ];
    expect(parseDiscogsTracklist(tracklist)).toEqual([
      { position: "1-a", title: "Speak To Me", duration: null },
      { position: "1-b", title: "Breathe", duration: null },
      { position: "2", title: "On The Run", duration: null },
    ]);
  });

  it("preserves real duration strings when present (real shape from a Now That's What I Call Music 13 track)", () => {
    const tracklist = [{ position: "1-01", type_: "track", title: "The Only Way Is Up", duration: "4:03" }];
    expect(parseDiscogsTracklist(tracklist)[0].duration).toBe("4:03");
  });

  // Discogs' API docs list "heading"/"index" as possible type_ values for
  // multi-part releases (e.g. a "Side A" divider row) — not observed in the
  // two real releases checked live, but filtered defensively since a heading
  // row has no real track to display.
  it("filters out non-track rows like headings", () => {
    const tracklist = [
      { position: "", type_: "heading", title: "Side A" },
      { position: "1", type_: "track", title: "Real Track", duration: "3:00" },
    ];
    expect(parseDiscogsTracklist(tracklist)).toEqual([{ position: "1", title: "Real Track", duration: "3:00" }]);
  });

  it("handles a missing/non-array tracklist without throwing", () => {
    expect(parseDiscogsTracklist(undefined)).toEqual([]);
    expect(parseDiscogsTracklist(null)).toEqual([]);
  });
});

describe("parseDiscogsRelease", () => {
  it("extracts full metadata (real shape from Pink Floyd - Dark Side Of The Moon, release 6184733)", () => {
    const release = {
      title: "Dark Side Of The Moon",
      artists_sort: "Pink Floyd",
      labels: [{ name: "SomeWax Recordings" }],
      genres: ["Rock"],
      styles: ["Psychedelic Rock", "Prog Rock"],
      formats: [{ name: "CD" }],
      year: 2001,
      images: [{ type: "primary", uri: "https://i.discogs.com/cover.jpeg" }],
      tracklist: [{ position: "1", type_: "track", title: "Speak To Me", duration: "" }],
    };
    expect(parseDiscogsRelease(release)).toEqual({
      title: "Dark Side Of The Moon",
      creator: "Pink Floyd",
      label: "SomeWax Recordings",
      genre: "Rock",
      style: "Psychedelic Rock, Prog Rock",
      album_type: "CD",
      year: 2001,
      coverUrl: "https://i.discogs.com/cover.jpeg",
      storeUrl: null,
      tracklist: [{ position: "1", title: "Speak To Me", duration: null }],
      notes: null,
      country: null,
      copyright: null,
      totalMinutes: null,
      communityRating: null,
      communityRatingCount: null,
    });
  });

  it("uses artists_sort as-is for compilations (real shape from Now That's What I Call Music 13)", () => {
    expect(parseDiscogsRelease({ title: "Various Artists Comp", artists_sort: "Various" }).creator).toBe("Various");
  });

  it("degrades gracefully when genres/styles/labels/formats/images are absent", () => {
    const result = parseDiscogsRelease({ title: "Bare Release", artists_sort: "Someone", year: 1999 });
    expect(result.genre).toBeNull();
    expect(result.style).toBeNull();
    expect(result.label).toBeNull();
    expect(result.album_type).toBeNull();
    expect(result.coverUrl).toBeNull();
    expect(result.tracklist).toEqual([]);
  });

  it("returns null for a null/undefined release", () => {
    expect(parseDiscogsRelease(null)).toBeNull();
    expect(parseDiscogsRelease(undefined)).toBeNull();
  });

  // Real shape from Black Light Burns - Cruel Melody, release 1387165 —
  // found live while investigating why Description/Country/Copyright/Total
  // Duration were all empty on Item Profile despite Discogs sending them.
  it("extracts notes/country/copyright/totalMinutes/communityRating (real shape, release 1387165)", () => {
    const release = {
      title: "Cruel Melody",
      artists_sort: "Black Light Burns",
      notes: "Released in a 6-panel Digipak with clear tray and a 12-page foldout booklet.",
      country: "Europe",
      companies: [
        { name: "Edel:Distribution", entity_type_name: "Distributed By" },
        { name: "I Am:Wolfpack", entity_type_name: "Phonographic Copyright (p)" },
        { name: "I Am:Wolfpack", entity_type_name: "Copyright (c)" },
        { name: "Optimal Media Production", entity_type_name: "Manufactured By" },
      ],
      community: { rating: { count: 44, average: 4.32 } },
      tracklist: [
        { position: "1", type_: "track", title: "Mesopotamia", duration: "4:29" },
        { position: "2", type_: "track", title: "Animal", duration: "4:08" },
      ],
    };
    const result = parseDiscogsRelease(release);
    expect(result.notes).toBe("Released in a 6-panel Digipak with clear tray and a 12-page foldout booklet.");
    expect(result.country).toBe("Europe");
    expect(result.copyright).toBe("I Am:Wolfpack");
    expect(result.totalMinutes).toBe(9); // 4:29 + 4:08 = 8:37, rounds to 9
    expect(result.communityRating).toBe(4.32);
    expect(result.communityRatingCount).toBe(44);
  });

  it("returns null totalMinutes when no track has a parseable duration, not zero", () => {
    const release = {
      title: "No Durations",
      tracklist: [{ position: "1", type_: "track", title: "Track One", duration: "" }],
    };
    expect(parseDiscogsRelease(release).totalMinutes).toBeNull();
  });

  it("uses the release's own uri as-is — already a full URL, unlike a search result's relative one (real shape, release 1387165)", () => {
    const release = { title: "Some Album", uri: "https://www.discogs.com/release/1387165-Black-Light-Burns-Cruel-Melody" };
    expect(parseDiscogsRelease(release).storeUrl).toBe("https://www.discogs.com/release/1387165-Black-Light-Burns-Cruel-Melody");
  });

  it("dedupes copyright when the same company holds both (c) and (p)", () => {
    const release = {
      title: "Same Holder",
      companies: [
        { name: "Same Label", entity_type_name: "Copyright (c)" },
        { name: "Same Label", entity_type_name: "Phonographic Copyright (p)" },
      ],
    };
    expect(parseDiscogsRelease(release).copyright).toBe("Same Label");
  });
});
