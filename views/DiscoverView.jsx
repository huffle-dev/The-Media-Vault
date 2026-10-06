import { useState, useEffect, useCallback } from "react";
import { T } from "../tokens.js";

// How many full rows to show before the user clicks "Show More" — the rest
// of each tab's already-fetched pool is revealed client-side with no extra
// TMDB call, then the button disappears once nothing's left.
const INITIAL_ROWS = 2;

// Two independent pickers, not one flat row of four — Movies/TV is the
// prominent, primary choice (bigger pills, its own row); Recommended/
// Trending sits underneath at the original smaller scale. The two are
// independent state, not nested, so switching Movies↔TV keeps whichever of
// Recommended/Trending was showing.
const MEDIA_TYPE_TABS = [
  { key: "Movie", label: "Movies", icon: "🎬" },
  { key: "TV",   label: "TV",     icon: "📺" },
  // Books: real genre-based recommendations (Open Library's /subjects
  // endpoint is a genuine genre browse, unlike Steam/BGG's text search).
  // No Trending source for this tab — Open Library has no equivalent feed
  // — so it's Recommended-only (see SOURCE_TABS' conditional render below).
  { key: "Book", label: "Books",  icon: "📖" },
  // Web Video: the latest uploads of the channels already in the library
  // (YouTube has no related-channels feed). Recommended-only, like Books.
  { key: "Web Video", label: "Web Video", icon: "📹" },
];
const SOURCE_TABS = [
  { key: "recommended", label: "Recommended" },
  { key: "trending",    label: "Trending" },
];

// Reads the grid's actual rendered column count (not guessed from the CSS
// minmax/gap math) so the reveal count below is always a real multiple of
// it. A callback ref, not a plain useRef — the grid doesn't exist yet while
// its tab is "Loading…", so this re-measures exactly when the DOM node
// shows up (and again on resize).
function useGridColumns() {
  const [el, setEl] = useState(null);
  const [columns, setColumns] = useState(1);
  const ref = useCallback(node => setEl(node), []);
  useEffect(() => {
    if (!el) return;
    const measure = () => {
      const cols = getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length;
      if (cols > 0) setColumns(cols);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [ref, columns];
}

// Page-grid tile — same visual language as ItemProfile's CreatorWorkTile
// but sized for a responsive grid instead of a fixed-width strip.
// `justAdded` holds a permanent checkmark once its title lands in the
// library, becoming a real link to the item's profile instead of a dead
// end. `loading` covers the gap between clicking "+" and the Add modal
// opening, since that round-trip does a real multi-call TMDB fetch with no
// other feedback. `onDismiss` is the "not interested" minus — only offered
// on a normal, still-addable tile.
const DiscoverTile = ({ title, year, posterUrl, rating, genre, because, justAdded, loading, square, wide, icon = "🎬", onQuickAdd, onView, onPreview, onDismiss }) => {
  const [hovered, setHovered] = useState(false);
  return (
  <div
    style={{ opacity: justAdded ? 0.6 : 1, cursor: "pointer" }}
    onClick={justAdded ? onView : onPreview}
    onMouseEnter={() => setHovered(true)}
    onMouseLeave={() => setHovered(false)}
  >
    <div style={{
      position: "relative", width: "100%", aspectRatio: wide ? "16/9" : square ? "1/1" : "2/3", borderRadius: 8, overflow: "hidden",
      background: T.surface2, border: `1px solid ${T.border}`,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {posterUrl
        ? <img src={posterUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <span style={{ fontSize: 30, opacity: 0.35 }}>{icon}</span>
      }
      {/* "Because you liked …" — only on hover, over the top of the picture. */}
      {because && hovered && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, padding: "10px 9px 22px",
          background: "linear-gradient(to bottom, rgba(5,5,10,0.92), rgba(5,5,10,0))",
          color: T.text, fontSize: 11, lineHeight: 1.35, fontFamily: T.fontSans, pointerEvents: "none",
        }}>Because you liked {because}</div>
      )}
      {!justAdded && !loading && (
        <span
          onClick={e => { e.stopPropagation(); onDismiss(); }}
          title="Not interested"
          style={{
            position: "absolute", bottom: 6, left: 6, width: 24, height: 24,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 15, fontWeight: 700, color: T.muted, cursor: "pointer",
            background: "rgba(0,0,0,0.65)", border: `1px solid ${T.border}`, borderRadius: 5,
          }}
        >−</span>
      )}
      {justAdded ? (
        <span style={{
          position: "absolute", bottom: 6, right: 6, width: 24, height: 24,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 700, color: "#4ade80",
          background: "rgba(0,0,0,0.7)", border: "1px solid #4ade8066", borderRadius: 5,
        }}>✓</span>
      ) : loading ? (
        <span title="Adding…" style={{
          position: "absolute", bottom: 6, right: 6, width: 24, height: 24,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 700, color: T.muted,
          background: "rgba(0,0,0,0.65)", border: `1px solid ${T.border}`, borderRadius: 5,
        }}>···</span>
      ) : (
        <span
          onClick={e => { e.stopPropagation(); onQuickAdd(); }}
          title="Add to your library"
          style={{
            position: "absolute", bottom: 6, right: 6, width: 24, height: 24,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 15, fontWeight: 700, color: T.accent, cursor: "pointer",
            background: "rgba(0,0,0,0.65)", border: `1px solid ${T.accent}66`, borderRadius: 5,
          }}
        >+</span>
      )}
    </div>
    <div style={{ marginTop: 7 }}>
      <div style={{
        fontSize: 12, color: T.text, lineHeight: 1.3, fontFamily: T.fontSans,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{title}</div>
      <div style={{ fontSize: 10, color: T.muted, fontFamily: T.fontMono, marginTop: 2 }}>
        {[year, genre].filter(Boolean).join(" · ")}
      </div>
      {rating != null && (
        <div style={{ fontSize: 10, color: "#f5c518", fontFamily: T.fontMono, marginTop: 1 }}>★ {rating.toFixed(1)}</div>
      )}
    </div>
  </div>
  );
};

const StateMessage = ({ children }) => (
  <div style={{
    padding: "28px 0", color: T.muted, fontSize: 12, fontFamily: T.fontMono,
  }}>{children}</div>
);

const ShowMoreButton = ({ onClick }) => (
  <div style={{ textAlign: "center", marginTop: 22 }}>
    <span
      onClick={onClick}
      style={{
        display: "inline-block", padding: "8px 20px", borderRadius: 100,
        border: `1px solid ${T.accent}66`, color: T.accent, cursor: "pointer",
        fontSize: 11, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "0.06em",
      }}
    >Show More</span>
  </div>
);

const GRID_STYLE = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 18 };
// Video thumbnails are 16:9, so their tiles are wider (and show the whole picture).
const WIDE_GRID_STYLE = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 18 };

// Kept across this view unmounting — opening a title's profile and coming
// back remounts Discover, which would otherwise refetch everything (slow,
// and the picks can shuffle) and drop you back on the first tab. Results go
// stale after 10 minutes; owned/dismissed titles are filtered at render, so
// a cached pool never shows something you've since added.
const CACHE_MS = 10 * 60 * 1000;
let discoverCache = null; // { at, recommendations, trending, bookRecommendations, webVideoUploads }
let lastTabs = { mediaType: "Movie", source: "recommended" };

export default function DiscoverView({ items = [], onQuickAdd, onViewItem, onPreviewItem, onOpenSettings }) {
  // null = still loading; { movie: {items,reason}, tv: {items,reason} } once resolved.
  // Only a fully loaded cache counts — leaving mid-load must refetch, not stick on "Loading…".
  const fresh = discoverCache && Date.now() - discoverCache.at < CACHE_MS && discoverCache.recommendations && discoverCache.trending && discoverCache.bookRecommendations && discoverCache.webVideoUploads ? discoverCache : null;
  const [recommendations, setRecommendations] = useState(fresh?.recommendations ?? null);
  const [trending, setTrending] = useState(fresh?.trending ?? null);
  // Book pool is its own single-shape result ({items, reason}), not split
  // by sub-type like film/tv — Books/Audiobooks already share one pool
  // server-side.
  const [bookRecommendations, setBookRecommendations] = useState(fresh?.bookRecommendations ?? null);
  const [webVideoUploads, setWebVideoUploads] = useState(fresh?.webVideoUploads ?? null);

  useEffect(() => {
    if (fresh) return;
    let cancelled = false;
    const cache = { at: Date.now() };
    discoverCache = cache;
    window.vault.discovery.recommendations().then(r => { cache.recommendations = r; if (!cancelled) setRecommendations(r); });
    window.vault.discovery.trending().then(t => { cache.trending = t; if (!cancelled) setTrending(t); });
    window.vault.discovery.bookRecommendations().then(b => { cache.bookRecommendations = b; if (!cancelled) setBookRecommendations(b); });
    window.vault.discovery.youtubeUploads().then(u => { cache.webVideoUploads = u; if (!cancelled) setWebVideoUploads(u); }).catch(() => { const e = { items: [], reason: "error" }; cache.webVideoUploads = e; if (!cancelled) setWebVideoUploads(e); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Independent, not nested — switching Movies↔TV keeps whichever of
  // Recommended/Trending was already showing, rather than resetting it.
  const [mediaType, setMediaTypeState] = useState(lastTabs.mediaType);
  const [source, setSourceState] = useState(lastTabs.source);
  const setMediaType = (t) => { lastTabs.mediaType = t; setMediaTypeState(t); };
  const setSource = (s) => { lastTabs.source = s; setSourceState(s); };
  // Books has no Trending source (see MEDIA_TYPE_TABS) — switching to it
  // while Trending was selected would otherwise land on a "trend-book"
  // section that doesn't exist in TAB_STATE below.
  const effectiveSource = (mediaType === "Book" || mediaType === "Web Video") ? "recommended" : source;
  const activeSection = `${effectiveSource === "recommended" ? "rec" : "trend"}-${mediaType === "Movie" ? "movie" : mediaType === "TV" ? "tv" : mediaType === "Web Video" ? "webvideo" : "book"}`;
  // One column-measurement + expand state per combination — hooks can't be
  // called in a loop, so these are declared explicitly rather than derived
  // from MEDIA_TYPE_TABS/SOURCE_TABS.
  const [recFilmGridRef, recFilmColumns] = useGridColumns();
  const [recTvGridRef, recTvColumns] = useGridColumns();
  const [recBookGridRef, recBookColumns] = useGridColumns();
  const [recWebGridRef, recWebColumns] = useGridColumns();
  const [trendFilmGridRef, trendFilmColumns] = useGridColumns();
  const [trendTvGridRef, trendTvColumns] = useGridColumns();
  const [recFilmExpanded, setRecFilmExpanded] = useState(false);
  const [recTvExpanded, setRecTvExpanded] = useState(false);
  const [recBookExpanded, setRecBookExpanded] = useState(false);
  const [recWebExpanded, setRecWebExpanded] = useState(false);
  const [trendFilmExpanded, setTrendFilmExpanded] = useState(false);
  const [trendTvExpanded, setTrendTvExpanded] = useState(false);

  // Tracks the user's own quick-add clicks made on THIS page (keyed
  // `${mediaType}-${id}`) through to the moment they land in the library.
  // `fetchingKeys` covers just the brief window between the click and the
  // Add modal opening. Once a title is in the library its tile disappears.
  const [fetchingKeys, setFetchingKeys] = useState(() => new Set());
  const [pendingKeys, setPendingKeys] = useState(() => new Set());

  const poolByKey = new Map();
  for (const w of recommendations?.movie?.items || []) poolByKey.set(`${w.mediaType}-${w.id}`, w);
  for (const w of recommendations?.tv?.items || []) poolByKey.set(`${w.mediaType}-${w.id}`, w);
  for (const w of trending?.movie?.items || []) poolByKey.set(`${w.mediaType}-${w.id}`, w);
  for (const w of trending?.tv?.items || []) poolByKey.set(`${w.mediaType}-${w.id}`, w);
  for (const w of bookRecommendations?.items || []) poolByKey.set(`${w.mediaType}-${w.id}`, w);
  for (const w of webVideoUploads?.items || []) poolByKey.set(`${w.mediaType}-${w.id}`, w);

  // Real library items keyed for lookup two ways — by TMDB id (stable even
  // if TMDB has since renamed the title) and by title (fallback for
  // OMDB-sourced or manually-typed items with no TMDB id). Doubles as the
  // "already owned" check and, for a title added here, the item a ticked
  // tile links to.
  const filmTv = items.filter(i => i.media_type === "Movie" || i.media_type === "TV");
  const inLibraryItemByTmdbId = new Map(
    filmTv.filter(i => i.platform_id && /^\d+$/.test(i.platform_id)).map(i => [`${i.media_type}-${i.platform_id}`, i])
  );
  const inLibraryItemByTitle = new Map(filmTv.map(i => [i.title.toLowerCase(), i]));

  // Same two-way lookup for Books — keyed by Open Library work id instead
  // of a numeric TMDB one, and Book+Audiobook share one pool, so both feed
  // the same maps.
  const books = items.filter(i => i.media_type === "Book" || i.media_type === "Audiobook");
  const inLibraryBookByKey = new Map(books.filter(i => i.platform_id).map(i => [i.platform_id, i]));
  const inLibraryBookByTitle = new Map(books.map(i => [i.title.toLowerCase(), i]));

  // Shared by the pending-landed effect and visibleFrom below — branches on
  // mediaType since Books use a different id scheme/map pair than Film/TV.
  const inLibraryWebVideoById = new Map(items.filter(i => i.media_type === "Web Video" && i.platform_id).map(i => [i.platform_id, i]));
  const findOwnedItem = (work) => work.mediaType === "Web Video"
    ? inLibraryWebVideoById.get(work.id)
    : work.mediaType === "Book"
    ? (inLibraryBookByKey.get(work.id) || inLibraryBookByTitle.get(work.title.toLowerCase()))
    : (inLibraryItemByTmdbId.get(`${work.mediaType}-${work.id}`) || inLibraryItemByTitle.get(work.title.toLowerCase()));

  // Fires whenever the library changes — checks pending quick-adds against
  // it, and clears any that just landed from the pending set.
  useEffect(() => {
    if (pendingKeys.size === 0) return;
    const stillPending = new Set(pendingKeys);
    const justLanded = [];
    for (const key of pendingKeys) {
      const work = poolByKey.get(key);
      if (!work) continue;
      const landed = findOwnedItem(work);
      if (landed) { stillPending.delete(key); justLanded.push(key); }
    }
    if (!justLanded.length) return;
    // Landed in the library — no longer pending. Nothing is kept for a
    // checkmark: once owned, the render-time filter in visibleFrom drops the
    // tile, so a title you add (here or from its preview) simply disappears.
    setPendingKeys(stillPending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const handleQuickAdd = async (work) => {
    const key = `${work.mediaType}-${work.id}`;
    if (fetchingKeys.has(key)) return; // already in flight — ignore a second click
    setFetchingKeys(prev => new Set(prev).add(key));
    try {
      // year/creator only actually matter for Book's branch of
      // resolveSearchDetails — harmless no-ops for Film/TV, which re-fetch
      // both from TMDB directly.
      const details = await window.vault.search.details({ platformId: String(work.id), mediaType: work.mediaType, year: work.year, creator: work.creator });
      setPendingKeys(prev => new Set(prev).add(key));
      onQuickAdd(details);
    } catch { /* same silent-skip as any other optional lookup failing */ }
    finally {
      setFetchingKeys(prev => { const next = new Set(prev); next.delete(key); return next; });
    }
  };

  // Clicking a tile (not its + or −) opens the title's Item Profile in
  // preview mode — the same fetched-but-not-saved profile Search Online's rows
  // open, with its own Add button. An already-owned tile goes to the real item
  // instead (onView). Shares fetchingKeys with quick-add so the tile shows its
  // loading state either way and a second click is ignored.
  const handlePreview = async (work) => {
    const key = `${work.mediaType}-${work.id}`;
    if (fetchingKeys.has(key)) return;
    setFetchingKeys(prev => new Set(prev).add(key));
    try {
      const details = await window.vault.search.details({ platformId: String(work.id), mediaType: work.mediaType, year: work.year, creator: work.creator });
      const dupe = await window.vault.items.findDuplicate({
        title: details.title, media_type: details.media_type,
        imdb_url: details.imdb_url, platform_id: details.platform_id, year: details.year,
      });
      if (dupe) {
        if (details.cover_art_path) window.vault.coverArt.deleteIfUnused(details.cover_art_path).catch(() => {});
        onViewItem(dupe);
      } else {
        onPreviewItem(details);
      }
    } catch { /* same silent-skip as any other optional lookup failing */ }
    finally {
      setFetchingKeys(prev => { const next = new Set(prev); next.delete(key); return next; });
    }
  };

  // "Not interested" — persists to discovery_dismissed (excluded
  // server-side on future fetches) but updates optimistically here too: the
  // write is fire-and-forget, since the pool already in state needs its own
  // immediate local exclusion regardless.
  const [dismissedKeys, setDismissedKeys] = useState(() => new Set());
  const handleDismiss = (work) => {
    const key = `${work.mediaType}-${work.id}`;
    setDismissedKeys(prev => new Set(prev).add(key));
    window.vault.discovery.dismiss(work.mediaType, String(work.id), work.title).catch(() => {});
  };

  // Dedupes the pool (belt-and-suspenders), drops anything owned from
  // before this session or dismissed as "not interested", then windows the
  // rest to a real multiple of the measured column count — INITIAL_ROWS
  // worth normally, or everything once expanded — so a row is only ever
  // partial when the pool itself doesn't stretch to a full one.
  const visibleFrom = (pool, columns, expanded) => {
    const seen = new Set();
    const filtered = [];
    for (const w of pool) {
      const key = `${w.mediaType}-${w.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (dismissedKeys.has(key)) continue;
      const ownedItem = findOwnedItem(w);
      if (ownedItem) continue;
      filtered.push({ ...w, key, justAdded: !!ownedItem, ownedItem: ownedItem || null });
    }
    // Expanded means "everything" literally — no flooring to a full-row
    // multiple. The bug this replaces: flooring ran unconditionally, so
    // whenever the pool held more than INITIAL_ROWS but not a full extra
    // row (e.g. 2 rows + 3 stragglers with a 5-column grid), "Show More"
    // computed the exact same revealCount as before expanding — the button
    // vanished (hasMore forces false once expanded) but no new tile ever
    // appeared. Found live: reported "every time" on Trending Movies, whose
    // pool — after excluding an 1900+-item library's owned titles — landed
    // in that partial-row band consistently, not as an edge case.
    if (expanded) return { visible: filtered, hasMore: false };
    const rowCap = Math.min(filtered.length, columns * INITIAL_ROWS);
    const revealCount = rowCap < columns ? rowCap : Math.floor(rowCap / columns) * columns;
    return { visible: filtered.slice(0, revealCount), hasMore: filtered.length > revealCount };
  };

  // Web Video: one section per channel (newest-uploading channel first), each
  // with its own wide 16:9 tiles — no Show More, every channel's few videos show.
  const renderWebVideoSections = (result, emptyCopy) => {
    const { visible } = result?.items ? visibleFrom(result.items, 1, true) : { visible: [] };
    if (visible.length === 0) return <StateMessage>{emptyCopy}</StateMessage>;
    const groups = new Map();
    for (const w of visible) {
      const key = w.channelId || w.genre || "";
      if (!groups.has(key)) groups.set(key, { title: w.channelTitle || w.genre || "Unknown channel", works: [] });
      groups.get(key).works.push(w);
    }
    return [...groups.entries()].map(([key, g]) => (
      <div key={key} style={{ marginBottom: 28 }}>
        <div style={{ borderBottom: `1px solid ${T.border}`, paddingBottom: 8, marginBottom: 14, color: T.accent, fontSize: 11, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "0.06em" }}>{g.title}</div>
        <div style={WIDE_GRID_STYLE}>
          {g.works.map(w => (
            <DiscoverTile
              key={w.key}
              title={w.title}
              year={w.year}
              wide
              icon="📹"
              posterUrl={w.coverUrl || null}
              justAdded={w.justAdded}
              loading={fetchingKeys.has(w.key)}
              onQuickAdd={() => handleQuickAdd(w)}
              onPreview={() => handlePreview(w)}
              onView={w.ownedItem ? () => onViewItem(w.ownedItem) : undefined}
              onDismiss={() => handleDismiss(w)}
            />
          ))}
        </div>
      </div>
    ));
  };

  const renderSection = (result, emptyCopy, gridRef, columns, expanded, setExpanded) => {
    // The online demo has no internet access to TMDB / Open Library / YouTube: say so instead of sitting on "Loading…".
    if (typeof window !== "undefined" && window.__DEMO__) {
      return <StateMessage>Discover suggests new things from TMDB, Open Library and YouTube, using your own API keys, so it is switched off in this online demo. In the real app it fills this page with recommendations based on what you already have.</StateMessage>;
    }
    if (mediaType === "Web Video" && result && !result.reason) return renderWebVideoSections(result, emptyCopy);
    const { visible, hasMore } = result?.items ? visibleFrom(result.items, columns, expanded) : { visible: [], hasMore: false };
    return (
      result === null ? (
        <StateMessage>Loading…</StateMessage>
      ) : result.reason === "no_channels" ? (
        <StateMessage>Add a few YouTube channels to your library (Search Online → Web Video → Channels) and their newest videos will show up here.</StateMessage>
      ) : result.reason === "error" ? (
        <StateMessage>Couldn't reach YouTube just now — reopen Discover to try again.</StateMessage>
      ) : result.reason === "no_key" ? (
        <StateMessage>
          {mediaType === "Web Video" ? "New uploads need a YouTube API key." : "Discovery needs a TMDB API key."}{" "}
          <span onClick={onOpenSettings} style={{ color: T.accent, cursor: "pointer", textDecoration: "underline" }}>
            Add one in Settings
          </span>.
        </StateMessage>
      ) : visible.length === 0 ? (
        <StateMessage>{emptyCopy}</StateMessage>
      ) : (
        <>
          <div ref={gridRef} style={GRID_STYLE}>
            {visible.map(w => (
              <DiscoverTile
                key={w.key}
                title={w.title}
                year={w.year}
                square={w.mediaType === "Web Video"}
                icon={w.mediaType === "Web Video" ? "📹" : "🎬"}
                posterUrl={w.mediaType === "Web Video"
                  ? (w.coverUrl || null)
                  : w.mediaType === "Book"
                  ? (w.coverId ? `https://covers.openlibrary.org/b/id/${w.coverId}-M.jpg` : null)
                  : (w.poster_path ? `https://image.tmdb.org/t/p/w342${w.poster_path}` : null)}
                rating={w.rating}
                genre={w.genre}
                because={w.because}
                justAdded={w.justAdded}
                loading={fetchingKeys.has(w.key)}
                onQuickAdd={() => handleQuickAdd(w)}
                onPreview={() => handlePreview(w)}
                onView={w.ownedItem ? () => onViewItem(w.ownedItem) : undefined}
                onDismiss={() => handleDismiss(w)}
              />
            ))}
          </div>
          {hasMore && <ShowMoreButton onClick={() => setExpanded(true)} />}
        </>
      )
    );
  };

  // Per-tab wiring — result comes from the matching { film, tv } sub-object
  // once its parent has resolved; a still-null parent means every one of
  // its tabs is still "Loading…", not just the active one.
  const TAB_STATE = {
    "rec-movie": {
      result: recommendations === null ? null : recommendations.movie,
      emptyCopy: recommendations?.movie?.reason === "no_seeds"
        ? "Rate a few movies you've watched — recommendations are built from your ratings."
        : "Nothing new to recommend right now.",
      gridRef: recFilmGridRef, columns: recFilmColumns, expanded: recFilmExpanded, setExpanded: setRecFilmExpanded,
    },
    "rec-tv": {
      result: recommendations === null ? null : recommendations.tv,
      emptyCopy: recommendations?.tv?.reason === "no_seeds"
        ? "Rate a few TV shows you've watched — recommendations are built from your ratings."
        : "Nothing new to recommend right now.",
      gridRef: recTvGridRef, columns: recTvColumns, expanded: recTvExpanded, setExpanded: setRecTvExpanded,
    },
    "trend-movie": {
      result: trending === null ? null : trending.movie,
      emptyCopy: "Nothing to show right now.",
      gridRef: trendFilmGridRef, columns: trendFilmColumns, expanded: trendFilmExpanded, setExpanded: setTrendFilmExpanded,
    },
    "trend-tv": {
      result: trending === null ? null : trending.tv,
      emptyCopy: "Nothing to show right now.",
      gridRef: trendTvGridRef, columns: trendTvColumns, expanded: trendTvExpanded, setExpanded: setTrendTvExpanded,
    },
    "rec-book": {
      result: bookRecommendations,
      emptyCopy: bookRecommendations?.reason === "no_seeds"
        ? "Rate a few books you've read — recommendations are built from your ratings and genres."
        : "Nothing new to recommend right now.",
      gridRef: recBookGridRef, columns: recBookColumns, expanded: recBookExpanded, setExpanded: setRecBookExpanded,
    },
    "rec-webvideo": {
      result: webVideoUploads,
      emptyCopy: "No new videos from your channels right now.",
      gridRef: recWebGridRef, columns: recWebColumns, expanded: recWebExpanded, setExpanded: setRecWebExpanded,
    },
  };
  const active = TAB_STATE[activeSection];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px 34px 40px" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {MEDIA_TYPE_TABS.map(t => (
          <button key={t.key} onClick={() => setMediaType(t.key)} style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "10px 22px",
            border: `1px solid ${mediaType === t.key ? T.accent : T.border}`,
            borderRadius: 100, cursor: "pointer",
            background: mediaType === t.key ? T.accent + "22" : "transparent",
            color: mediaType === t.key ? T.accent : T.muted,
            fontSize: 14, fontFamily: T.fontSans,
            fontWeight: mediaType === t.key ? 700 : 500,
            transition: "all 0.12s",
          }}>
            <span style={{ fontSize: 15 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* No Trending source for Books — hidden entirely rather than
          showing a pill that would lead nowhere. */}
      {mediaType !== "Book" && mediaType !== "Web Video" && (
        <div style={{ display: "flex", gap: 6, marginBottom: 22, flexWrap: "wrap" }}>
          {SOURCE_TABS.map(t => (
            <button key={t.key} onClick={() => setSource(t.key)} style={{
              padding: "6px 13px",
              border: `1px solid ${effectiveSource === t.key ? T.accent : T.border}`,
              borderRadius: 100, cursor: "pointer",
              background: effectiveSource === t.key ? T.accent + "22" : "transparent",
              color: effectiveSource === t.key ? T.accent : T.muted,
              fontSize: 11, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "0.05em",
              fontWeight: effectiveSource === t.key ? 600 : 400,
              transition: "all 0.1s",
            }}>{t.label}</button>
          ))}
        </div>
      )}

      {renderSection(active.result, active.emptyCopy, active.gridRef, active.columns, active.expanded, active.setExpanded)}
    </div>
  );
}
