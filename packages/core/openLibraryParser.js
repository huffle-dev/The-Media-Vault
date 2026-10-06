// Pure extraction of book metadata from Open Library's raw API shapes.
// Split out from main.js for direct unit test coverage, same rationale as
// ratingParsers.js. See openLibraryParser.test.js.

// A work's `subjects` array is community-tagged and often a messy mix of
// genres, award/bestseller tags ("New York Times Bestseller"), specific
// places/characters (parenthetical, e.g. "Dune (Imaginary place)"), and
// near-duplicate synonyms — so the first genre-shaped entry is picked rather
// than blindly using subjects[0]. Falls back to subjects[0] if none qualify.
function cleanGenre(subjects) {
  if (!Array.isArray(subjects) || subjects.length === 0) return null;
  const genreLike = subjects.find(s => typeof s === "string" && !s.includes("(") && !/^(series|nyt):/i.test(s) && !/bestseller/i.test(s));
  const chosen = genreLike ?? subjects[0];
  return typeof chosen === "string" ? chosen.replace(/-/g, " ") : null;
}

// Open Library tags series inside the same `subjects` array genre is drawn
// from (e.g. "series:Stormlight Archive") — no dedicated series field exists
// on the work record, so this tag is the only real source.
function cleanSeriesName(subjects) {
  if (!Array.isArray(subjects)) return null;
  const tag = subjects.find(s => /^series:/i.test(s));
  return tag ? tag.replace(/^series:/i, "").trim() || null : null;
}

// ISO 639-2 codes seen on Open Library search docs — search.json aggregates
// language/publisher/page-count across every edition, so these fields live
// here rather than on the (edition-agnostic) work record. Uncommon codes
// fall back to the raw code.
const LANGUAGE_NAMES = {
  eng: "English", spa: "Spanish", fre: "French", fra: "French", ger: "German", deu: "German",
  ita: "Italian", por: "Portuguese", jpn: "Japanese", chi: "Chinese", zho: "Chinese",
  rus: "Russian", pol: "Polish", heb: "Hebrew", dut: "Dutch", nld: "Dutch", kor: "Korean",
};
// The `language` array isn't ordered by relevance — every edition's language
// in no particular order — so English is picked out when present rather than
// blindly taking index 0, since most real usage here is English editions.
function cleanLanguage(codes) {
  if (!Array.isArray(codes) || codes.length === 0) return null;
  const code = codes.includes("eng") ? "eng" : codes[0];
  return LANGUAGE_NAMES[code] || code.toUpperCase();
}

// Open Library's read/borrow link, built from the Internet Archive id of
// whichever scanned edition it has. Only "public" (fully open) and
// "borrowable" (1-hour IA loan) get a real link — "printdisabled"/"no_ebook"
// aren't worth surfacing.
function cleanEbookUrl(ebookAccess, ia) {
  if (ebookAccess !== "public" && ebookAccess !== "borrowable") return null;
  const id = Array.isArray(ia) ? ia[0] : null;
  return id ? `https://archive.org/details/${id}` : null;
}

// Search hits carry everything needed for the result-list row plus the
// fields worth threading through to search:details (year/creator/publisher/
// language/page-count/ebook-availability aren't reliably present on the work
// record itself — see parseOpenLibraryWork).
function parseOpenLibrarySearchResult(doc) {
  if (!doc || !doc.key || !doc.title) return null;
  const year = doc.first_publish_year || null;
  return {
    platformId: doc.key.replace("/works/", ""),
    title: year ? `${doc.title} (${year})` : doc.title,
    year,
    creator: doc.author_name?.[0] || null,
    thumbnailUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
    publisher: doc.publisher?.[0] || null,
    language: cleanLanguage(doc.language),
    pageCount: doc.number_of_pages_median || null,
    ebookUrl: cleanEbookUrl(doc.ebook_access, doc.ia),
  };
}

// Open Library's `description` comes back as either a plain string or a
// `{type: "/type/text", value: "..."}` wrapper — both handled here.
function cleanDescription(description) {
  if (typeof description === "string") return description.trim() || null;
  if (description && typeof description.value === "string") return description.value.trim() || null;
  return null;
}

// Best-effort "Tags" — remaining subject headings once genre and series are
// set aside, so the field isn't just a duplicate of Genre. Same filtering as
// cleanGenre (structured/bestseller entries excluded), plus dedup against
// the chosen genre itself.
function cleanTags(subjects, genre, seriesName) {
  if (!Array.isArray(subjects)) return null;
  const genreLower = genre?.toLowerCase();
  const tags = subjects
    .filter(s => typeof s === "string" && !s.includes("(") && !/^(series|nyt):/i.test(s) && !/bestseller/i.test(s))
    .map(s => s.replace(/-/g, " "))
    .filter(s => s.toLowerCase() !== genreLower)
    .slice(0, 4);
  return tags.length ? tags.join(", ") : null;
}

// A work's `covers` array can contain -1 as a placeholder for "known missing
// cover" — passing that through would just download a broken-image placeholder.
function parseOpenLibraryWork(work) {
  const covers = Array.isArray(work?.covers) ? work.covers : [];
  const coverId = covers.find(c => typeof c === "number" && c > 0) || null;
  const genre = cleanGenre(work?.subjects);
  const seriesName = cleanSeriesName(work?.subjects);
  return {
    title: work?.title || null,
    genre,
    coverId,
    description: cleanDescription(work?.description),
    seriesName,
    tags: cleanTags(work?.subjects, genre, seriesName),
  };
}

module.exports = { parseOpenLibrarySearchResult, parseOpenLibraryWork };
