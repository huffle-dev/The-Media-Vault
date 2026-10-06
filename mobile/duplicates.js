// Is this about to be added a second time? The same rules as desktop's findDuplicate
// (database.js), run over the phone's loaded library list. Pure —
// test/mobileDuplicates.test.js runs it without Expo.
//
// Order: an IMDb id, then the same source id within the same type, then the same
// title within the type — and for a title alone the year must agree, because a bare
// title collides on remakes (a 2021 "Dune" is not the 1984 one).

const imdbId = (text) => (String(text || "").match(/tt\d+/) || [])[0] || null;

export function findDuplicate(items, { title, media_type, imdb_url, platform_id, year }) {
  const list = items || [];
  const imdb = imdbId(imdb_url) || imdbId(platform_id);
  if (imdb) {
    const hit = list.find((i) => imdbId(i.platform_id) === imdb || imdbId(i.imdb_url) === imdb);
    if (hit) return hit;
  }
  if (platform_id && media_type) {
    const hit = list.find((i) => i.media_type === media_type && i.platform_id != null && String(i.platform_id) === String(platform_id));
    if (hit) return hit;
  }
  if (title && media_type) {
    const lower = String(title).trim().toLowerCase();
    const hit = list.find((i) => i.media_type === media_type
      && String(i.title || "").trim().toLowerCase() === lower
      && (year == null || i.year == null || Number(i.year) === Number(year)));
    if (hit) return hit;
  }
  return null;
}
