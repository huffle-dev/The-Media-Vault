import { useState, useEffect, useRef, useCallback } from "react";
import { T, cleanIpcError, TYPE_TABS, isSquareArt } from "../tokens.js";
import { bggSearch, bggDetails } from "../sync/bggApi.js";
import { BGG_WARNING, BGG_NOTICE_KEY } from "@media-vault/core/bggWarning.js";

const CloseBtn = ({ onClick }) => {
  const [h, setH] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        background: h ? T.hoverWashStrong : "none", border: "none",
        color: h ? T.text : T.muted, cursor: "pointer", fontSize: 18,
        width: 28, height: 28, borderRadius: 4, display: "flex",
        alignItems: "center", justifyContent: "center", transition: "all 0.12s",
      }}
    >✕</button>
  );
};

const SUPPORTED_TYPES = ["Game", "Board Game", "Movie", "TV", "Web Video", "Podcast", "Book", "Audiobook", "Music"];
const BGG_TYPES = ["Board Game"];
// Which stores a Game search can be run against — Steam stays the default.
// See main.js's search:query/resolveSearchDetails for the actual GOG
// API calls.
const GAME_STORES = [
  { id: "steam", label: "Steam" },
  { id: "gog",   label: "GOG" },
  { id: "igdb",  label: "IGDB" },
];
// Display labels — internal mediaType stays "Movie" (matches the DB value), but the
// library's own tabs already call it "Movies", so match that here for consistency.
const TAB_LABELS = { Movie: "Movies" };
// Icons and render order both come straight from TYPE_TABS, so this modal's
// type picker matches the rest of the app instead of inventing its own set.
const TYPE_ICONS = Object.fromEntries(
  TYPE_TABS.filter(t => t.includes?.length === 1).map(t => [t.includes[0], t.icon])
);
const ORDERED_TYPES = TYPE_TABS
  .filter(t => t.includes?.length === 1 && SUPPORTED_TYPES.includes(t.includes[0]))
  .map(t => t.includes[0]);
// Shared by the search placeholder and the empty-state copy.
const typeNoun = (t) => t === "TV" ? "TV show" : t === "Movie" ? "movie" : t === "Board Game" ? "board game" : t.toLowerCase();

// Restored via `initialState` when reopened from Item Profile's "Back to
// Search" — everything here is worth bringing back so the results/query
// don't have to be redone. `thumbs` has to be included too, not just
// `results` — it's only populated inside handleSearch, which a restore
// never re-runs. `loading`/`error` deliberately aren't part of it —
// transient, not worth restoring.
const snapshotState = (s) => ({ mediaType: s.mediaType, gameStore: s.gameStore, videoKind: s.videoKind, query: s.query, results: s.results, addedMap: s.addedMap, thumbs: s.thumbs });

export default function SearchModal({ initialMediaType = "Game", initialState = null, autoRun = false, onItemAdded, onViewItem, onPreviewItem, onClose }) {
  const initialType = SUPPORTED_TYPES.includes(initialMediaType) ? initialMediaType : "Game";
  const [mediaType, setMediaType]   = useState(initialState?.mediaType ?? initialType);
  // Which store to search when mediaType is Game — Steam's storesearch API
  // is the default; GOG is a real public/keyless endpoint
  // too, gated behind Cloudflare bot-management that needs a browser
  // User-Agent (see main.js's BROWSER_HEADERS).
  const [gameStore, setGameStore]   = useState(initialState?.gameStore ?? "steam");
  // Web Video only: search YouTube channels or single videos. (A pasted
  // YouTube link ignores this — it resolves straight to what it points at.)
  const [videoKind, setVideoKind]   = useState(initialState?.videoKind ?? "channel");
  const [query, setQuery]           = useState(initialState?.query ?? "");
  const [results, setResults]       = useState(initialState?.results ?? []);
  const [loading, setLoading]       = useState(false);
  // Which result is mid-fetch/add right now (either click path) — disables
  // every other row while it resolves.
  const [busyId, setBusyId]         = useState(null);
  // platformId -> the created item, for results added via the +Add icon.
  // The row stays in place with a permanent checkmark rather than
  // disappearing, and becomes clickable through to that item's profile.
  const [addedMap, setAddedMap]     = useState(initialState?.addedMap ?? {});
  const [error, setError]           = useState(null);
  // True while the one-time "this is unofficial" notice for Board Game search is waiting for an answer.
  const [bggNotice, setBggNotice]     = useState(false);
  const [thumbs, setThumbs]         = useState(initialState?.thumbs ?? {});
  // Steam thumbnails are written to disk on demand (search:thumbnail) and
  // aren't tied to a saved item until Add — a manual orphan-cleanup run
  // during a long-open search can sweep one out from under a still-visible
  // <img>. Tracks which platformIds have already had a retry attempt so a
  // second failure falls back to the placeholder instead of retry-looping.
  const thumbRetriedRef = useRef(new Set());
  // True when the current results came from the silent IGDB fallback, not
  // the store the picker is set to — surfaced as a small note above the
  // results so a "Steam" selection showing "IGDB ↗" rows isn't confusing.
  const [igdbFallbackUsed, setIgdbFallbackUsed] = useState(false);
  const inputRef = useRef(null);
  // Release year from a browser-extension deep link — applies only to that
  // link's own search; dropped as soon as the user edits the query or type.
  const deepLinkYearRef = useRef(initialState?.year ?? null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Deep-link open (vault://search?...) — fires the search immediately
  // instead of waiting for a manual submit. Mount-only: must not re-trigger
  // on every keystroke once the user starts editing the prefilled query.
  useEffect(() => {
    if (autoRun && query.trim()) handleSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Guards against an older search's response landing after a newer one —
  // firing a second search (changed query/type) before the first's
  // query()/bggSearch() call resolves otherwise lets whichever response
  // lands last win, silently replacing newer results with stale ones.
  const searchSeqRef = useRef(0);

  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!query.trim()) return;
    // Board Game search goes through a hidden browser window on BoardGameGeek: say so once, and carry on only if agreed.
    if (BGG_TYPES.includes(mediaType) && !bggNotice && (await window.vault.settings.get(BGG_NOTICE_KEY)) !== "1") {
      setBggNotice(true);
      return;
    }
    const seq = ++searchSeqRef.current;
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      let res;
      let usedIgdbFallback = false;
      if (BGG_TYPES.includes(mediaType)) {
        res = await bggSearch(query.trim());
      } else if (mediaType === "Game") {
        // The primary store call itself can fail outright, not just return
        // zero results — Steam's storesearch endpoint intermittently 403s
        // from Akamai's edge. A thrown error has to trigger the IGDB
        // fallback exactly like an empty result does, or a transient Steam
        // outage would permanently block the fallback.
        try {
          res = await window.vault.search.query({ query: query.trim(), mediaType, store: gameStore });
        } catch {
          res = [];
        }
        // Steam/GOG are both storefronts — a console-exclusive title
        // genuinely has nothing to find on any of them, not a failed
        // search. IGDB isn't tied to a storefront, so it's tried silently
        // once the picker's choice comes up empty. Wrapped in its own
        // try/catch — no IGDB key, or IGDB itself failing, falls through to
        // the normal "no results" message rather than surfacing as an error.
        if (res.length === 0 && gameStore !== "igdb") {
          try {
            const igdbRes = await window.vault.search.query({ query: query.trim(), mediaType, store: "igdb" });
            if (igdbRes.length > 0) { res = igdbRes; usedIgdbFallback = true; }
          } catch { /* no key set, or IGDB failed — stays empty, falls through */ }
        }
      } else {
        res = await window.vault.search.query({ query: query.trim(), mediaType, year: deepLinkYearRef.current || undefined, kind: mediaType === "Web Video" ? videoKind : undefined });
      }
      if (seq !== searchSeqRef.current) return; // a newer search started while this one was in flight
      setResults(res);
      setIgdbFallbackUsed(usedIgdbFallback);
      if (res.length === 0) setError("No results found — try a different title.");
      // Per-result rather than per-mediaType: a result with a thumbnailUrl
      // already (BGG/TMDB, GOG) uses it directly; one without (Steam,
      // no inline image) falls back to the per-id search:thumbnail lookup.
      setThumbs({});
      thumbRetriedRef.current = new Set();
      res.forEach(r => {
        if (r.thumbnailUrl) {
          setThumbs(prev => ({ ...prev, [r.platformId]: r.thumbnailUrl }));
        } else {
          window.vault.search.thumbnail({ platformId: r.platformId, mediaType })
            .then(tmpPath => { if (tmpPath && seq === searchSeqRef.current) setThumbs(prev => ({ ...prev, [r.platformId]: `file://${tmpPath}` })); })
            .catch(() => {});
        }
      });
    } catch (err) {
      if (seq !== searchSeqRef.current) return;
      setError(cleanIpcError(err) || "Search failed.");
    } finally {
      if (seq === searchSeqRef.current) setLoading(false);
    }
  };

  // Self-heals a thumbnail file that went missing after it was written (see
  // thumbRetriedRef above) by re-downloading it once; drops the entry to
  // fall back to the placeholder icon if that retry also fails.
  const handleThumbError = (platformId, mediaTypeForThumb) => {
    if (thumbRetriedRef.current.has(platformId)) {
      setThumbs(prev => { const next = { ...prev }; delete next[platformId]; return next; });
      return;
    }
    thumbRetriedRef.current.add(platformId);
    window.vault.search.thumbnail({ platformId, mediaType: mediaTypeForThumb })
      .then(tmpPath => {
        setThumbs(prev => {
          if (!tmpPath) { const next = { ...prev }; delete next[platformId]; return next; }
          return { ...prev, [platformId]: `file://${tmpPath}?r=${Date.now()}` };
        });
      })
      .catch(() => setThumbs(prev => { const next = { ...prev }; delete next[platformId]; return next; }));
  };

  // Per-type fetch logic — both click paths below save directly rather than
  // handing off to the Add/Edit modal.
  const fetchDetails = async (result) => {
    if (BGG_TYPES.includes(mediaType)) {
      const details = await bggDetails(result.platformId, mediaType);
      if (details._thumbnailUrl) {
        const artPath = await window.vault.bgg.downloadArt(details._thumbnailUrl, result.platformId).catch(() => null);
        if (artPath) details.cover_art_path = artPath;
        delete details._thumbnailUrl;
      }
      return details;
    }
    if (mediaType === "Movie" || mediaType === "TV") {
      // TMDB details already include a downloaded cover_art_path (see main.js search:details).
      // `source` tells main.js which service this particular result came from.
      return await window.vault.search.details({ platformId: result.platformId, mediaType, source: result.source });
    }
    // year/creator/publisher/language/pageCount are only ever set on Book/
    // Audiobook results — undefined for every other type, which main.js's
    // destructuring already handles as "not provided." genre/store/
    // thumbnailUrl are the same story for GOG Game results —
    // store picks the resolveSearchDetails branch, and thumbnailUrl lets GOG
    // download real cover art server-side.
    const details = await window.vault.search.details({
      platformId: result.platformId, mediaType, inferredType: result.type,
      year: result.year, creator: result.creator, genre: result.genre,
      // result.source, not the gameStore picker state — the IGDB fallback
      // above means a Steam-selected search can still return IGDB-sourced
      // rows, and resolveSearchDetails needs to route each one correctly.
      // Steam results carry no `source`, which is fine — undefined falls
      // through to that type's default branch.
      store: mediaType === "Game" ? result.source : undefined,
      thumbnailUrl: result.thumbnailUrl,
      publisher: result.publisher, language: result.language, pageCount: result.pageCount,
      ebookUrl: result.ebookUrl,
    });
    // Only fall back to the search-result-list thumbnail if search:details
    // didn't already download real art server-side (Web Video
    // does) — otherwise this would clobber it with a lower-res thumbnail.
    const thumbFileUrl = thumbs[result.platformId];
    // Only a locally downloaded file (file://) can stand in as cover art — a
    // result carrying a remote thumbnailUrl (YouTube, TMDB…) stores that URL
    // in `thumbs`, and saving it as cover_art_path left a path that points
    // at nothing (found on a YouTube video whose own art download failed).
    if (thumbFileUrl && thumbFileUrl.startsWith("file://") && !details.cover_art_path) {
      // Strip the retry cache-buster (see handleThumbError) as well as the
      // file:// prefix — the stored path must be the bare filesystem path.
      details.cover_art_path = thumbFileUrl.replace(/^file:\/\//, "").replace(/\?r=\d+$/, "");
    }
    return details;
  };

  const fetchAndCheckDuplicate = async (result) => {
    const details = await fetchDetails(result);
    const dupe = await window.vault.items.findDuplicate({
      title: details.title, media_type: details.media_type,
      imdb_url: details.imdb_url, platform_id: details.platform_id, year: details.year,
    });
    return { details, dupe };
  };

  // The art fetched alongside details is only committed to disk once an
  // item gets saved with it — if a duplicate already owns that same path,
  // coverArtPathInUse() leaves it alone; otherwise it's an orphan and gets
  // removed.
  const cleanupUnusedArt = (coverArtPath) => {
    if (coverArtPath) window.vault.coverArt.deleteIfUnused(coverArtPath).catch(() => {});
  };

  // Clicking the row itself: never saves anything. A duplicate jumps
  // straight to the item you already have. Otherwise opens Item Profile in
  // preview mode on the fetched (not yet persisted) details — the cover art
  // is NOT cleaned up here, since it becomes the real item's art if saved;
  // abandoning the preview without saving triggers that cleanup instead.
  const handleRowClick = async (result) => {
    setBusyId(result.platformId);
    setError(null);
    try {
      const { details, dupe } = await fetchAndCheckDuplicate(result);
      if (dupe) {
        cleanupUnusedArt(details.cover_art_path);
        onViewItem(dupe, snapshotState({ mediaType, gameStore, videoKind, query, results, addedMap, thumbs }));
        return;
      }
      onPreviewItem(details, snapshotState({ mediaType, gameStore, videoKind, query, results, addedMap, thumbs }));
    } catch (err) {
      setError(cleanIpcError(err) || "Failed to add item.");
    } finally {
      setBusyId(null);
    }
  };

  // Clicking +Add: stays in the search results so multiple results can be
  // added from one search. A duplicate asks before creating a second copy.
  const handlePlusClick = async (result) => {
    setBusyId(result.platformId);
    setError(null);
    try {
      const { details, dupe } = await fetchAndCheckDuplicate(result);
      if (dupe && !confirm(`"${dupe.title}" is already in your library. Add anyway?`)) {
        cleanupUnusedArt(details.cover_art_path);
        return;
      }
      const created = await window.vault.items.add(details);
      onItemAdded(created);
      setAddedMap(prev => ({ ...prev, [result.platformId]: created }));
    } catch (err) {
      setError(cleanIpcError(err) || "Failed to add item.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(5,5,10,0.88)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 100,
    }}>
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: 10, width: 600, maxHeight: "88vh",
        display: "flex", flexDirection: "column",
        boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
      }}>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 20px 14px", borderBottom: `1px solid ${T.border}`, flexShrink: 0,
        }}>
          <div style={{ fontFamily: T.fontSerif, fontSize: 17, color: T.text }}>
            Search Online
          </div>
          <CloseBtn onClick={onClose} />
        </div>

        {/* Search bar */}
        <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
          {/* Media type picker */}
          <div style={{ marginBottom: 12 }}>
            <select
              value={mediaType}
              onChange={e => { deepLinkYearRef.current = null; setMediaType(e.target.value); setResults([]); setError(null); setIgdbFallbackUsed(false); }}
              style={{
                padding: "5px 10px", background: T.surface2, border: `1px solid ${T.border}`,
                borderRadius: 5, color: T.text, fontSize: 12, fontFamily: T.fontSans,
                outline: "none", cursor: "pointer",
              }}
            >
              {ORDERED_TYPES.map(t => (
                <option key={t} value={t}>{TYPE_ICONS[t]} {TAB_LABELS[t] || t}</option>
              ))}
            </select>
          </div>

          {/* Store picker — Game only, defaults to Steam */}
          {mediaType === "Game" && (
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {GAME_STORES.map(s => (
                <button key={s.id} onClick={() => { setGameStore(s.id); setResults([]); setError(null); setIgdbFallbackUsed(false); }} style={{
                  padding: "4px 12px",
                  background: gameStore === s.id ? T.accent + "22" : T.surface2,
                  border: `1px solid ${gameStore === s.id ? T.accent : T.border}`,
                  borderRadius: 5, color: gameStore === s.id ? T.accent : T.muted,
                  fontSize: 11, cursor: "pointer", fontFamily: T.fontMono,
                  fontWeight: gameStore === s.id ? 600 : 400, transition: "all 0.12s",
                }}>{s.label}</button>
              ))}
            </div>
          )}

          {/* Kind picker — Web Video only */}
          {mediaType === "Web Video" && (
            <div style={{ display: "flex", gap: 6, marginBottom: 12, alignItems: "center" }}>
              {[{ id: "channel", label: "Channels" }, { id: "video", label: "Videos" }].map(k => (
                <button key={k.id} onClick={() => { setVideoKind(k.id); setResults([]); setError(null); }} style={{
                  padding: "4px 12px",
                  background: videoKind === k.id ? T.accent + "22" : T.surface2,
                  border: `1px solid ${videoKind === k.id ? T.accent : T.border}`,
                  borderRadius: 5, color: videoKind === k.id ? T.accent : T.muted,
                  fontSize: 11, cursor: "pointer", fontFamily: T.fontMono,
                  fontWeight: videoKind === k.id ? 600 : 400, transition: "all 0.12s",
                }}>{k.label}</button>
              ))}
              <span style={{ fontSize: 10, color: T.dim, fontFamily: T.fontMono }}>or paste a YouTube link / @handle</span>
            </div>
          )}

          {/* Search input */}
          <form onSubmit={handleSearch} style={{ display: "flex", gap: 8 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <input
                ref={inputRef}
                value={query}
                onChange={e => { deepLinkYearRef.current = null; setQuery(e.target.value); }}
                placeholder={`Search for a ${typeNoun(mediaType)}…`}
                style={{
                  width: "100%", padding: "8px 12px 8px 30px", boxSizing: "border-box",
                  background: T.surface2, border: `1px solid ${T.border}`,
                  borderRadius: 5, color: T.text, fontSize: 13, outline: "none",
                  fontFamily: T.fontSans,
                }}
              />
              <span style={{
                position: "absolute", left: 10, top: "50%",
                transform: "translateY(-50%)", color: T.muted, fontSize: 14,
                pointerEvents: "none",
              }}>⌕</span>
            </div>
            <button type="submit" disabled={loading || !query.trim()} style={{
              padding: "8px 18px",
              background: loading || !query.trim() ? T.surface2 : T.accent,
              color: loading || !query.trim() ? T.muted : T.bg,
              border: "none", borderRadius: 5, fontSize: 12, fontWeight: 700,
              cursor: loading || !query.trim() ? "not-allowed" : "pointer",
              fontFamily: T.fontSans, flexShrink: 0, transition: "all 0.12s",
            }}>{loading ? "Searching…" : "Search"}</button>
          </form>
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 20px" }}>
          {bggNotice && (
            <div role="alert" style={{ border: `1px solid ${T.accent}`, borderRadius: 6, padding: 12, marginBottom: 12, background: T.surface2, fontSize: 12, color: T.text, lineHeight: 1.5 }}>
              <div style={{ fontWeight: 700, marginBottom: 6, color: T.accent }}>Before searching Board Games</div>
              {BGG_WARNING.map((line) => <p key={line} style={{ margin: "0 0 6px" }}>{line}</p>)}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button type="button" onClick={async () => { await window.vault.settings.set(BGG_NOTICE_KEY, "1"); setBggNotice(false); handleSearch(); }}
                  style={{ padding: "6px 14px", background: T.accent, color: T.bg, border: "none", borderRadius: 5, fontWeight: 700, cursor: "pointer", fontFamily: T.fontSans }}>I understand, search</button>
                <button type="button" onClick={() => setBggNotice(false)}
                  style={{ padding: "6px 14px", background: T.surface, color: T.text, border: `1px solid ${T.border}`, borderRadius: 5, cursor: "pointer", fontFamily: T.fontSans }}>Cancel</button>
              </div>
            </div>
          )}

          {error && (
            <div style={{ fontSize: 11, color: "#e84b6e", fontFamily: T.fontMono, marginBottom: 12 }}>
              {error}
            </div>
          )}

          {igdbFallbackUsed && results.length > 0 && (
            <div style={{ fontSize: 11, color: T.accent, fontFamily: T.fontMono, marginBottom: 12 }}>
              Nothing found on {GAME_STORES.find(s => s.id === gameStore)?.label} — showing IGDB results instead.
            </div>
          )}

          {results.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {results.map(r => {
                const added = addedMap[r.platformId];
                const busy = busyId === r.platformId;
                return (
                <button
                  key={r.platformId}
                  onClick={() => added ? onViewItem(added, snapshotState({ mediaType, gameStore, videoKind, query, results, addedMap, thumbs })) : handleRowClick(r)}
                  disabled={busyId !== null && !added}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "8px 10px",
                    background: busy ? T.accent + "11" : T.surface2,
                    border: `1px solid ${busy ? T.accent : T.border}`,
                    borderRadius: 6, cursor: busyId !== null && !added ? "not-allowed" : "pointer",
                    textAlign: "left", transition: "all 0.12s",
                    opacity: busyId !== null && !busy && !added ? 0.5 : 1,
                  }}
                  onMouseEnter={e => { if (!busyId) e.currentTarget.style.borderColor = T.dim; }}
                  onMouseLeave={e => { if (!busyId) e.currentTarget.style.borderColor = T.border; }}
                >
                  {/* Thumbnail — portrait 2:3 ratio, except Music/Podcast/Board Game/Audiobook (square cover art) */}
                  <div style={{
                    width: 40, height: isSquareArt(mediaType) ? 40 : 60, borderRadius: 3, flexShrink: 0,
                    background: T.surface, overflow: "hidden",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: `1px solid ${T.border}`,
                  }}>
                    {thumbs[r.platformId]
                      ? <img src={thumbs[r.platformId]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          onError={() => handleThumbError(r.platformId, mediaType)} />
                      : <span style={{ fontSize: 16, opacity: 0.2 }}>
                          {mediaType === "Board Game" ? "🎲" : mediaType === "Movie" ? "🎬" : mediaType === "TV" ? "📺" : mediaType === "Book" ? "📖" : mediaType === "Audiobook" ? "🎧" : mediaType === "Music" ? "🎵" : mediaType === "Podcast" ? "🎙️" : "🎮"}
                        </span>
                    }
                  </div>

                  {/* Title + type */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, color: T.text,
                      fontFamily: T.fontSerif,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{r.title}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <span style={{
                        fontSize: 9, fontFamily: T.fontMono,
                        color: r.type === "game" ? T.accent : r.type === "board game" ? "#e84b4b" : r.type === "movie" ? T.accent : r.type === "tv" ? T.blue : r.type === "music" ? "#f472b6" : T.muted,
                        textTransform: "uppercase", letterSpacing: "0.06em",
                      }}>{r.type}</span>
                      {r.detail && (
                        <span style={{ fontSize: 10, color: T.muted, fontFamily: T.fontMono }}>{r.detail}</span>
                      )}
                      {r.storeUrl && (
                        <span
                          onClick={e => { e.stopPropagation(); window.vault.shell.openExternal(r.storeUrl); }}
                          style={{
                            fontSize: 9, fontFamily: T.fontMono,
                            color: T.blue, cursor: "pointer", textDecoration: "underline",
                            letterSpacing: "0.03em",
                          }}
                        >{r.storeLabel || "↗"}</span>
                      )}
                    </div>
                  </div>

                  {/* Action */}
                  {added ? (
                    <span style={{
                      fontSize: 10, color: T.accent, fontFamily: T.fontMono, flexShrink: 0,
                    }}>✓ Added</span>
                  ) : (
                    <span
                      onClick={e => { e.stopPropagation(); handlePlusClick(r); }}
                      style={{
                        fontSize: 10, color: busy ? T.accent : T.muted,
                        fontFamily: T.fontMono, flexShrink: 0,
                        cursor: busyId !== null ? "not-allowed" : "pointer",
                      }}
                    >
                      {busy ? "Loading…" : "+ Add"}
                    </span>
                  )}
                </button>
                );
              })}
            </div>
          )}

          {!loading && !error && results.length === 0 && (
            <div style={{
              textAlign: "center", padding: "40px 0",
              color: T.muted, fontFamily: T.fontMono, fontSize: 11,
            }}>
              <div style={{ fontSize: 40, opacity: 0.25, marginBottom: 10 }}>{TYPE_ICONS[mediaType]}</div>
              Search for a {typeNoun(mediaType)} to add it to your library
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
