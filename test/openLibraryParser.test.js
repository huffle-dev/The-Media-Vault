import { describe, it, expect } from "vitest";
import openLibraryParser from "@media-vault/core/openLibraryParser";
const { parseOpenLibrarySearchResult, parseOpenLibraryWork } = openLibraryParser;

describe("parseOpenLibrarySearchResult", () => {
  it("extracts platformId/title/year/creator/thumbnail (real shape from Open Library search, Project Hail Mary)", () => {
    const doc = {
      author_key: ["OL7234434A"],
      author_name: ["Andy Weir"],
      cover_i: 11200092,
      first_publish_year: 2021,
      key: "/works/OL21745884W",
      title: "Project Hail Mary",
      publisher: ["Ballantine Books"],
      language: ["eng"],
      number_of_pages_median: 476,
      ebook_access: "printdisabled",
      ia: ["projecthailmary0000weir"],
    };
    expect(parseOpenLibrarySearchResult(doc)).toEqual({
      platformId: "OL21745884W",
      title: "Project Hail Mary (2021)",
      year: 2021,
      creator: "Andy Weir",
      thumbnailUrl: "https://covers.openlibrary.org/b/id/11200092-M.jpg",
      publisher: "Ballantine Books",
      language: "English",
      pageCount: 476,
      ebookUrl: null,
    });
  });

  // Regression case for a real API quirk found via live testing: ebook_access
  // has a "printdisabled" value that means "not actually readable by a
  // general user" — verified live against The Way of Kings, a normal
  // in-copyright book — so a link is only ever built for "public" or
  // "borrowable", not just whenever an `ia` id happens to be present.
  it("builds a Read Online link for a public-domain work but not a printdisabled one (real shapes)", () => {
    const publicDomain = { key: "/works/OL1W", title: "Alice in Wonderland", ebook_access: "public", ia: ["aliceinwonderla00carrgoog"] };
    expect(parseOpenLibrarySearchResult(publicDomain).ebookUrl).toBe("https://archive.org/details/aliceinwonderla00carrgoog");

    const borrowable = { key: "/works/OL2W", title: "Some Book", ebook_access: "borrowable", ia: ["somebook0000auth"] };
    expect(parseOpenLibrarySearchResult(borrowable).ebookUrl).toBe("https://archive.org/details/somebook0000auth");

    const printDisabled = { key: "/works/OL3W", title: "The Way of Kings", ebook_access: "printdisabled", ia: ["wayofkings0000sand"] };
    expect(parseOpenLibrarySearchResult(printDisabled).ebookUrl).toBeNull();

    const noEbook = { key: "/works/OL4W", title: "No Ebook Book", ebook_access: "no_ebook" };
    expect(parseOpenLibrarySearchResult(noEbook).ebookUrl).toBeNull();
  });

  it("omits the year suffix and thumbnail when the doc doesn't have them", () => {
    const doc = { key: "/works/OL36735881W", title: "Some Anthology", author_name: ["Andy Weir"] };
    const result = parseOpenLibrarySearchResult(doc);
    expect(result.title).toBe("Some Anthology");
    expect(result.year).toBeNull();
    expect(result.thumbnailUrl).toBeNull();
    expect(result.publisher).toBeNull();
    expect(result.language).toBeNull();
    expect(result.pageCount).toBeNull();
  });

  it("falls back to the raw uppercased code for an unmapped language", () => {
    const doc = { key: "/works/OL1W", title: "Rare Language Book", language: ["xyz"] };
    expect(parseOpenLibrarySearchResult(doc).language).toBe("XYZ");
  });

  // Regression case for a real API quirk found via live testing: the
  // language array isn't ordered by relevance, so blindly taking index 0
  // picked "Polish" for an English work with foreign-translation editions
  // cataloged first (real shape, The Way of Kings: ["pol","por","heb","eng",...]).
  it("prefers English when present in the language array, regardless of position (real shape, The Way of Kings)", () => {
    const doc = { key: "/works/OL1W", title: "The Way of Kings", language: ["pol", "por", "heb", "eng", "ger", "spa"] };
    expect(parseOpenLibrarySearchResult(doc).language).toBe("English");
  });

  it("falls back to null creator when author_name is absent", () => {
    const doc = { key: "/works/OL1W", title: "Anonymous Work" };
    expect(parseOpenLibrarySearchResult(doc).creator).toBeNull();
  });

  it("returns null for a doc missing a key or title rather than erroring", () => {
    expect(parseOpenLibrarySearchResult({ title: "No key" })).toBeNull();
    expect(parseOpenLibrarySearchResult({ key: "/works/OL1W" })).toBeNull();
    expect(parseOpenLibrarySearchResult(null)).toBeNull();
  });
});

describe("parseOpenLibraryWork", () => {
  it("takes the first subject as genre and the first valid cover id (real shape from Open Library works.json, Project Hail Mary)", () => {
    const work = {
      title: "Project Hail Mary",
      subjects: ["hard science-fiction", "science-fiction", "sci-fi"],
      covers: [11200092, 11212360, 11482074],
    };
    expect(parseOpenLibraryWork(work)).toEqual({
      title: "Project Hail Mary",
      genre: "hard science fiction",
      coverId: 11200092,
      description: null,
      seriesName: null,
      tags: "science fiction, sci fi",
    });
  });

  // Regression case for a real API quirk found via live testing: Open
  // Library's covers array can contain -1 as a "known missing cover"
  // placeholder, which would otherwise produce a broken image URL.
  it("skips a -1 placeholder cover id and uses the next valid one", () => {
    const work = { title: "Some Book", subjects: [], covers: [-1, 555] };
    expect(parseOpenLibraryWork(work).coverId).toBe(555);
  });

  it("returns null genre/coverId/seriesName/tags when subjects/covers are absent", () => {
    expect(parseOpenLibraryWork({ title: "Bare Record" })).toEqual({
      title: "Bare Record",
      genre: null,
      coverId: null,
      description: null,
      seriesName: null,
      tags: null,
    });
  });

  it("handles a null/undefined work without throwing", () => {
    const empty = { title: null, genre: null, coverId: null, description: null, seriesName: null, tags: null };
    expect(parseOpenLibraryWork(null)).toEqual(empty);
    expect(parseOpenLibraryWork(undefined)).toEqual(empty);
  });

  // Real shape from Open Library works.json — "series:X" is the only place a
  // work's series shows up, sitting inside the same messy subjects array as
  // genre and award-list tags (verified live, The Way of Kings).
  it("extracts series name from a series: tagged subject and folds leftovers into tags (real shape, The Way of Kings)", () => {
    const work = {
      title: "The Way of Kings",
      subjects: ["New York Times Bestseller", "Fantasy", "Epic Fantasy", "nyt:hardcover-fiction=2010-09-19", "series:Stormlight Archive"],
    };
    const result = parseOpenLibraryWork(work);
    expect(result.seriesName).toBe("Stormlight Archive");
    expect(result.genre).toBe("Fantasy");
    expect(result.tags).toBe("Epic Fantasy");
  });

  // Regression case for a real API quirk found via live testing: a
  // bestseller-list mention is a real subject value, not a parenthetical or
  // series:/nyt:-prefixed one, but it isn't a genre either — genre used to
  // pick "New York Times Bestseller" here, which then got fed into "More
  // Like This"'s genre-browse as a slug that doesn't exist on Open Library's
  // side, silently returning zero results (real case, The Way of Kings).
  it("skips a bestseller-list mention in favor of the first real genre-like subject", () => {
    const work = { title: "Some Book", subjects: ["New York Times bestseller", "Mystery fiction"] };
    expect(parseOpenLibraryWork(work).genre).toBe("Mystery fiction");
  });

  // Real shape variance found via live testing (Dune) — description comes
  // back wrapped, not as a plain string, and this was the actual missing
  // piece: Book items got no Description at all in Item Profile before this.
  it("extracts description text from the wrapped {type, value} shape (real shape, Dune)", () => {
    const work = { title: "Dune", description: { type: "/type/text", value: "Set on the desert planet Arrakis..." } };
    expect(parseOpenLibraryWork(work).description).toBe("Set on the desert planet Arrakis...");
  });

  it("also accepts a plain string description", () => {
    const work = { title: "Some Book", description: "A short plain-string description." };
    expect(parseOpenLibraryWork(work).description).toBe("A short plain-string description.");
  });

  // Regression case for a real API quirk found via live testing: subjects[0]
  // isn't reliably a genre — it can be a specific in-story entity instead,
  // and Open Library's own convention marks those with a parenthetical.
  it("skips a parenthetical (specific-entity) subject in favor of the first genre-like one (real shape, Dune)", () => {
    const work = {
      title: "Dune",
      subjects: ["Dune (Imaginary place)", "Fiction", "Fiction, science fiction, general", "Dune (imaginary place), fiction"],
    };
    expect(parseOpenLibraryWork(work).genre).toBe("Fiction");
  });

  it("falls back to subjects[0] when every subject has a parenthetical", () => {
    const work = { title: "Alice", subjects: ["Alice (fictitious character : carroll), fiction", "British and irish fiction (fictional works by one author)"] };
    expect(parseOpenLibraryWork(work).genre).toBe("Alice (fictitious character : carroll), fiction");
  });
});
