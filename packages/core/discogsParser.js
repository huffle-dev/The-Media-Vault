// Pure extraction of album metadata from Discogs' raw API shapes. Split out
// from main.js for direct unit test coverage, same rationale as
// ratingParsers.js / openLibraryParser.js. See discogsParser.test.js.

function parseDiscogsSearchResult(r) {
  if (!r || !r.id || !r.title) return null;
  return {
    platformId: String(r.id),
    title: r.year ? `${r.title} (${r.year})` : r.title,
    // Unauthenticated search often comes back with no thumb — null until the
    // user adds a Discogs token; the release-detail fetch always has art.
    thumbnailUrl: r.thumb || r.cover_image || null,
    storeUrl: r.uri ? `https://www.discogs.com${r.uri}` : null,
  };
}

// Discogs' tracklist can include non-"track" rows (heading/index entries for
// multi-part releases) alongside real tracks — only "track" rows are kept.
// Empty duration strings become null rather than "".
function parseDiscogsTracklist(tracklist) {
  if (!Array.isArray(tracklist)) return [];
  return tracklist
    .filter(t => t && t.type_ === "track" && t.title)
    .map(t => ({
      position: t.position || null,
      title: t.title,
      duration: t.duration || null,
    }));
}

// Discogs has no single "copyright" field — it's buried in `companies`,
// one row per credited company/role (distributor, mastering plant, etc.).
// Only the two roles that actually mean "copyright" count; a release
// commonly has both a (c) and a (p) entry, often the same name — deduped
// since showing "Label X, Label X" would look like a bug.
function parseDiscogsCopyright(companies) {
  if (!Array.isArray(companies)) return null;
  const names = companies
    .filter(c => c && (c.entity_type_name === "Copyright (c)" || c.entity_type_name === "Phonographic Copyright (p)"))
    .map(c => c.name);
  return names.length ? [...new Set(names)].join(", ") : null;
}

// Discogs gives per-track duration as "M:SS" (or blank) but no release-level
// total, unlike TMDB/Open Library — summed here instead. Null (not 0) if no
// track has a parseable duration, so it reads as "unknown" not "zero minutes".
function parseDiscogsTotalMinutes(tracklist) {
  if (!Array.isArray(tracklist)) return null;
  let totalSeconds = 0;
  let any = false;
  for (const t of tracklist) {
    if (!t || !t.duration) continue;
    const m = /^(\d+):(\d{2})$/.exec(String(t.duration).trim());
    if (!m) continue;
    totalSeconds += Number(m[1]) * 60 + Number(m[2]);
    any = true;
  }
  return any ? Math.round(totalSeconds / 60) : null;
}

function parseDiscogsRelease(release) {
  if (!release) return null;
  const genres = Array.isArray(release.genres) ? release.genres : [];
  const styles = Array.isArray(release.styles) ? release.styles : [];
  const labels = Array.isArray(release.labels) ? release.labels : [];
  const formats = Array.isArray(release.formats) ? release.formats : [];
  const images = Array.isArray(release.images) ? release.images : [];
  const cover = images.find(img => img && img.uri) || null;
  const tracklist = parseDiscogsTracklist(release.tracklist);

  return {
    title: release.title || null,
    creator: release.artists_sort || null,
    label: labels[0]?.name || null,
    genre: genres.length ? genres.join(", ") : null,
    style: styles.length ? styles.join(", ") : null,
    album_type: formats[0]?.name || null,
    year: release.year || null,
    coverUrl: cover ? cover.uri : null,
    // Unlike a search result's `uri` (relative — see parseDiscogsSearchResult
    // above), the release-detail endpoint's `uri` is already absolute; don't
    // re-prepend the domain here.
    storeUrl: release.uri || null,
    tracklist,
    notes: release.notes || null,
    country: release.country || null,
    copyright: parseDiscogsCopyright(release.companies),
    totalMinutes: parseDiscogsTotalMinutes(tracklist),
    communityRating: release.community?.rating?.average || null,
    communityRatingCount: release.community?.rating?.count || null,
  };
}

module.exports = { parseDiscogsSearchResult, parseDiscogsTracklist, parseDiscogsRelease };
