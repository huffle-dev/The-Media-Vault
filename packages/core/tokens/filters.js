// Library filter/search predicates — split out of App.jsx as part of the
// code-organization plan's post-Phase-C tidy-up. Pure, stateless functions
// with no React involved, same shape as itemHelpers.js/ratings.js, so they
// belong here rather than in App.jsx itself.
import { ratingToDisplay, externalRatingValue } from "./ratings.js";
import { parseCastList, watchProvidersForRegion, effectivePlatform, webVideoKind, isOwned } from "./itemHelpers.js";
import { effectiveType } from "./mediaTypes.js";
import { STATUS_WHEEL_ORDER } from "./constants.js";

// Genres are stored comma-separated (e.g. "Horror, Comedy") — split into individual tokens.
export const splitGenres = (genreStr) => (genreStr || "").split(",").map(g => g.trim()).filter(Boolean);

// "+8 & up" etc. thresholds for the Personal Rating filter — same −10..+10
// scale ratingToDisplay() already uses everywhere else the rating is shown.
export const personalRatingMatches = (item, bucket) => {
  if (!bucket || bucket === "Any Rating") return true;
  if (item.rating == null) return false;
  const d = ratingToDisplay(item.rating);
  if (bucket === "+8 & up") return d >= 8;
  if (bucket === "+5 & up") return d >= 5;
  if (bucket === "+1 & up") return d >= 1;
  if (bucket === "0 & up")  return d >= 0;
  if (bucket === "Below 0") return d < 0;
  return true;
};

// "8+" etc. thresholds for the Critic Rating filter — reuses
// externalRatingValue() so a threshold always means the same thing it means
// in the Critic Rating sort, regardless of source (IMDb/RT/Metacritic/TMDB,
// Metacritic/IGDB, BGG, Discogs, Open Library).
export const criticRatingMatches = (item, bucket) => {
  if (!bucket || bucket === "Any Critic Rating") return true;
  const v = externalRatingValue(item);
  if (v == null) return false;
  if (bucket === "8+") return v >= 8;
  if (bucket === "6+") return v >= 6;
  if (bucket === "5+") return v >= 5;
  if (bucket === "3+") return v >= 3;
  return true;
};

// Search checks title, creator/director, and cast, in that priority order.
// Returns {field, value} (or null) so the UI can hint "matched: <name>" when
// the hit came from creator/cast rather than the title itself. For cast,
// "value" is the one matching actor, not the full comma list.
export const searchMatchField = (item, q) => {
  if (item.title.toLowerCase().includes(q)) return { field: "title" };
  if ((item.creator || "").toLowerCase().includes(q)) return { field: "creator", value: item.creator };
  const castMatch = parseCastList(item.cast_list).find(c => c.name.toLowerCase().includes(q));
  if (castMatch) return { field: "cast", value: castMatch.name };
  // tags are comma-separated, same pattern as genre — reuses splitGenres.
  const tagMatch = splitGenres(item.tags).find(t => t.toLowerCase().includes(q));
  if (tagMatch) return { field: "tag", value: tagMatch };
  return null;
};

// Narrowing shared by filteredItems (library grid) and statScopedItems (top
// bar counts) — tab/genre/ageRating/platform/list/rating-bucket/search. Kept
// as one function so a new filter only needs to be added once; quickFilter,
// ownedFilter/ratedFilter, and sort stay caller-specific since
// statScopedItems deliberately ignores them.
export const buildBaseFilter = (items, { activeTab, allTypeTabs, genre, ageRating, platformFilter, osConsole, listFilter, personalRating, criticRating, search, hiddenFilter, webKind = "all" }) => {
  let result = items;

  if (activeTab !== "All") {
    const tab = allTypeTabs.find(t => t.label === activeTab);
    if (tab) result = result.filter(i => tab.includes.includes(effectiveType(i)));
  }

  // Web Video only: "channel" | "video" | "playlist" (anything else = all kinds).
  if (webKind === "channel" || webKind === "video" || webKind === "playlist") result = result.filter(i => webVideoKind(i) === webKind);

  if (genre !== "All Genres") result = result.filter(i => splitGenres(i.genre).includes(genre));
  if (ageRating !== "All Age Ratings") result = result.filter(i => i.content_rating === ageRating);
  if (platformFilter !== "All Platforms") result = result.filter(i => effectivePlatform(i) === platformFilter);
  // Game's own `platform` column is IGDB's comma-separated "available on"
  // list — same multi-value shape as genre, so it reuses splitGenres. Only
  // populated for Games enriched via IGDB (Search Online, Fetch Info) — a
  // plain Steam/GOG sync doesn't fill it in.
  if (osConsole !== "All OS & Consoles") result = result.filter(i => splitGenres(i.platform).includes(osConsole));
  if (listFilter) result = result.filter(i => i.list_ids.includes(listFilter));

  // "visible" (default) excludes hidden items entirely, same as Steam's own
  // Hidden category — they stay out of the way until deliberately restored.
  if (hiddenFilter === "visible") result = result.filter(i => !i.is_hidden);
  else if (hiddenFilter === "hidden") result = result.filter(i => i.is_hidden);

  result = result.filter(i => personalRatingMatches(i, personalRating));
  result = result.filter(i => criticRatingMatches(i, criticRating));

  if (search.trim()) {
    const q = search.toLowerCase();
    result = result
      .map(i => {
        const m = searchMatchField(i, q);
        if (!m) return null;
        return m.field === "title" ? i : { ...i, _searchMatch: m.field, _searchMatchValue: m.value };
      })
      .filter(Boolean);
  }

  return result;
};

// Shared by filteredItems and handleWatchFilterChange — one copy so a new
// status pill only needs adding here, not to two separate if-chains.
export const applyQuickFilter = (items, quickFilter) => {
  if (quickFilter === "Wishlist")     return items.filter(i => i.status === "wishlist");
  if (quickFilter === "Not Started")  return items.filter(i => i.status === "not-started");
  if (quickFilter === "In Progress")  return items.filter(i => i.status === "in-progress");
  if (quickFilter === "Consumed")     return items.filter(i => i.status === "consumed");
  if (quickFilter === "Dropped")      return items.filter(i => i.status === "dropped");
  return items;
};

// Owned and Rated are independent of the status quick-filter and of each
// other — both can combine with any status, same as genre/list/search.
export const applyOwnedRatedFilter = (items, ownedFilter, ratedFilter) => {
  let result = items;
  if (ownedFilter === "owned")     result = result.filter(i => isOwned(i));
  if (ownedFilter === "not-owned") result = result.filter(i => !isOwned(i));
  if (ratedFilter === "rated")     result = result.filter(i => i.rating !== null);
  if (ratedFilter === "not-rated") result = result.filter(i => i.rating === null);
  return result;
};

// Matches if the provider shows up in any of the user's selected
// availability types (Streaming/Rent/Buy) for the currently selected
// region. The cache covers every country in one shot, so an item just has
// no match yet if it hasn't been checked at all. Unlike Owned/Rated, this
// isn't circular — a plain dropdown filter, not a pill-count toggle — so
// both filteredItems and statScopedItems apply it.
export const applyWatchFilter = (items, watchFilter, watchAvailabilityTypes, watchRegion) => {
  if (!watchFilter) return items;
  return items.filter(i =>
    watchAvailabilityTypes.some(type => watchProvidersForRegion(i, watchRegion, type).includes(watchFilter))
  );
};


// "Recently Added" is insertion order: the local integer id on desktop, and
// the row's created_at on the phone (which has no local id).
const recentlyAdded = (a, b) => (a.id != null && b.id != null)
  ? b.id - a.id
  : (b.created_at || b.date_added || "").localeCompare(a.created_at || a.date_added || "");

// One sort, by any SORT_OPTIONS value. Returns a NEW array (stable order for
// ties, as Array.sort guarantees). Shared by the desktop grid and the phone's
// Library so both order a library identically.
export const sortItems = (items, sort) => {
  const result = [...items];
  if (sort === "A–Z")           result.sort((a, b) => a.title.localeCompare(b.title));
  if (sort === "Z–A")           result.sort((a, b) => b.title.localeCompare(a.title));
  // Nulls (not yet rated) always sort to the bottom, in either direction —
  // `|| 0` previously treated an unrated item the same as a rating of
  // exactly stored-0, a value that doesn't exist (stored range is 1-21),
  // so unrated items interleaved into the middle of the list instead.
  if (sort === "Rating ↓")      result.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  if (sort === "Rating ↑")      result.sort((a, b) => (a.rating ?? 999) - (b.rating ?? 999));
  // Nulls (no critic rating available) always sort to the bottom, in either direction.
  if (sort === "Critic Rating ↓") result.sort((a, b) => (externalRatingValue(b) ?? -1) - (externalRatingValue(a) ?? -1));
  if (sort === "Critic Rating ↑") result.sort((a, b) => (externalRatingValue(a) ?? 999) - (externalRatingValue(b) ?? 999));
  if (sort === "Recently Added") result.sort(recentlyAdded);
  // Distinct from "Recently Added" (insertion order) — sorts by the actual
  // date_added value, which diverges for CSV-imported items whose date_added
  // was backdated rather than set at insert time.
  if (sort === "Date Added ↓") result.sort((a, b) => (b.date_added || "").localeCompare(a.date_added || ""));
  if (sort === "Date Added ↑") result.sort((a, b) => (a.date_added || "").localeCompare(b.date_added || ""));
  if (sort === "Year ↓")        result.sort((a, b) => (b.year || 0) - (a.year || 0));
  if (sort === "Year ↑")        result.sort((a, b) => (a.year || 0) - (b.year || 0));
  if (sort === "Runtime ↓")     result.sort((a, b) => (b.runtime || 0) - (a.runtime || 0));
  if (sort === "Runtime ↑")     result.sort((a, b) => (a.runtime || 0) - (b.runtime || 0));
  if (sort === "Creator A–Z")   result.sort((a, b) => (a.creator || "zzz").localeCompare(b.creator || "zzz"));
  if (sort === "Series") {
    result.sort((a, b) => {
      const sc = (a.series_name || "").localeCompare(b.series_name || "");
      if (sc !== 0) return sc;
      return (a.series_order || 0) - (b.series_order || 0);
    });
  }
  if (sort === "Type A–Z")  result.sort((a, b) => effectiveType(a).localeCompare(effectiveType(b)));
  if (sort === "Type Z–A")  result.sort((a, b) => effectiveType(b).localeCompare(effectiveType(a)));
  if (sort === "Genre A–Z") result.sort((a, b) => (a.genre || "").localeCompare(b.genre || ""));
  if (sort === "Genre Z–A") result.sort((a, b) => (b.genre || "").localeCompare(a.genre || ""));
  if (sort === "Status ↑")  result.sort((a, b) => STATUS_WHEEL_ORDER.indexOf(a.status) - STATUS_WHEEL_ORDER.indexOf(b.status));
  if (sort === "Status ↓")  result.sort((a, b) => STATUS_WHEEL_ORDER.indexOf(b.status) - STATUS_WHEEL_ORDER.indexOf(a.status));
  return result;
};
