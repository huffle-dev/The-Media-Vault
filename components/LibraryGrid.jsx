import { useRef, useState, useLayoutEffect, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { T, getEffectiveTypeConfig, formatRating, ratingColor, buildStatusChangePatch, buildOwnedChangePatch, isSquareArt, isOwned } from "../tokens.js";
import PosterCard, { StatusWheel, STATUS_COLOR_MAP, FAVOURITE_HOVER } from "./PosterCard.jsx";

// Stored range is 1 (display -10) to 21 (display +10), 11 = neutral 0 — see
// tokens.js. Nudging from unrated starts at neutral so the first click lands
// on ±1 rather than landing on 0 and needing a second click.
const nudgeRatingValue = (current, delta) => {
  const base = current != null ? current : 11;
  return Math.max(1, Math.min(21, base + delta));
};

// Scroll speed — max px a single wheel/trackpad tick may add to the target
// scroll position (see the wheel-smoothing effect below). "medium" matches
// the original hardcoded cap this setting replaced.
const SCROLL_SPEED_CAPS = { slow: 60, medium: 120, fast: 220, veryfast: 400 };

// List row size — poster/padding/font scale together; non-poster column
// widths stay fixed since they hold short fixed-format text that doesn't
// need to grow with size.
const LIST_ROW_SIZES = {
  small:  { posterW: 36, posterH: 54, padY: 6,  gap: 8,  titleFont: 13, cellFont: 10 },
  medium: { posterW: 46, posterH: 69, padY: 9,  gap: 10, titleFont: 14, cellFont: 10 },
  large:  { posterW: 58, posterH: 87, padY: 12, gap: 12, titleFont: 15, cellFont: 11 },
};
// Every content column (Title through Rating) is a minmax(_, 1fr) track so
// the row's leftover space splits evenly across all of them, rather than one
// or two tracks soaking up all the slack. Actions stays fixed width since
// it's a button cluster, not label text.
const listGridColumns = (size) => `20px ${LIST_ROW_SIZES[size].posterW}px 8px minmax(160px, 1fr) minmax(70px, 1fr) minmax(80px, 1fr) minmax(75px, 1fr) minmax(45px, 1fr) minmax(55px, 1fr) 125px`;
// Fixed per-row height for the list-view virtualizer — poster height plus
// its own top/bottom padding plus the row's own bottom border.
const listRowHeight = (size) => LIST_ROW_SIZES[size].posterH + LIST_ROW_SIZES[size].padY * 2 + 1;

// ── Sortable column header ───────────────────────────────────────────────
// options is [primary, secondary] — a fresh click (or clicking while the
// other option is active) applies primary; clicking while primary is
// already active flips to secondary. Reuses the same `sort` state as
// TopBar's Sort dropdown, so a header click and the dropdown never disagree.
const SortableHeader = ({ label, options, sort, onSortChange, align = "left" }) => {
  const activeIndex = options.findIndex(o => o.value === sort);
  const next = activeIndex === 0 ? options[1].value : options[0].value;
  const active = activeIndex >= 0 ? options[activeIndex] : null;
  return (
    <span
      onClick={() => onSortChange(next)}
      style={{ display: "block", width: "100%", textAlign: align, cursor: "pointer", userSelect: "none" }}
    >
      {label}{active && ` ${active.arrow}`}
    </span>
  );
};

// ── Empty state ────────────────────────────────────────────────────────────
const EmptyState = ({ hasItems }) => (
  <div style={{
    flex: 1, display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    color: T.muted, gap: 8,
  }}>
    <div style={{ fontSize: 40, opacity: 0.15 }}>◎</div>
    <div style={{ fontFamily: T.fontSerif, fontSize: 16, color: T.dim }}>
      {hasItems ? "No items match your filters" : "Your library is empty"}
    </div>
    <div style={{ fontSize: 11, fontFamily: T.fontMono, color: T.muted }}>
      {hasItems ? "Try adjusting your search or filters" : "Click Import / + Add to get started"}
    </div>
  </div>
);

// ── List row ───────────────────────────────────────────────────────────────
const ListRow = ({ item, index, size = "medium", customTypes = [], onView, onEdit, onDeleteRequest, onQuickSave, isFavourite = false, onToggleFavourite, onToggleHidden, selected, onToggleSelect }) => {
  const cfg = getEffectiveTypeConfig(item, customTypes);
  const statusColor = STATUS_COLOR_MAP[item.status] || T.blue;
  const s = LIST_ROW_SIZES[size];
  const [favHovered, setFavHovered] = useState(false);

  const statusCellRef = useRef(null);
  // Same as PosterCard's tile status wheel: captured once at click-time via
  // getBoundingClientRect() rather than read live off a ref.
  const [wheelAnchorRect, setWheelAnchorRect] = useState(null);

  return (
    <>
    <div style={{
      display: "grid",
      gridTemplateColumns: listGridColumns(size),
      alignItems: "center", padding: `${s.padY}px 14px`, gap: s.gap,
      borderBottom: `1px solid ${T.border}`,
      background: selected ? T.accent + "11" : (index % 2 === 0 ? T.bg : T.rowAlt),
      cursor: "pointer",
      opacity: item.is_hidden === 1 ? 0.5 : 1,
    }}
      onClick={() => onView(item)}
    >
      {/* Checkbox */}
      <div onClick={e => { e.stopPropagation(); onToggleSelect(item.id); }} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{
          width: 14, height: 14, borderRadius: 3,
          border: `1px solid ${selected ? T.accent : T.border}`,
          background: selected ? T.accent : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", flexShrink: 0,
        }}>
          {selected && <span style={{ fontSize: 9, color: T.bg, lineHeight: 1 }}>✓</span>}
        </div>
      </div>

      {/* Mini poster — square-art types letterbox inside a uniform 2:3 box
          so rows of mixed types line up, same treatment as PosterCard's
          mixed-tab tile grid. */}
      <div style={{
        width: s.posterW, height: s.posterH, borderRadius: 2,
        background: item.cover_art_path
          ? (isSquareArt(item.media_type) ? `${cfg.color}33` : "transparent")
          : cfg.gradient,
        flexShrink: 0, overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 16, opacity: 0.7,
      }}>
        {item.cover_art_path
          ? <img src={`file://${item.cover_art_path}`} alt="" decoding="async" style={
              isSquareArt(item.media_type)
                ? { width: "100%", aspectRatio: "1/1", objectFit: "cover" }
                : { width: "100%", height: "100%", objectFit: "cover" }
            } />
          : cfg.icon
        }
      </div>

      {/* Status dot */}
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor, flexShrink: 0 }} />

      {/* Title + creator — creator is already visible, so a creator-only
          search match is self-explanatory; only a cast match needs a hint. */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontFamily: T.fontSerif, fontSize: s.titleFont, color: T.text,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{item.title}</div>
        {item.creator && (
          <div style={{ fontSize: s.cellFont, color: T.muted, fontFamily: T.fontMono, marginTop: 1 }}>
            {item.creator}
          </div>
        )}
        {item._searchMatch === "cast" && (
          <div style={{ fontSize: s.cellFont, color: T.accent, fontFamily: T.fontMono, marginTop: 1 }}>
            matched cast: {item._searchMatchValue}
          </div>
        )}
        {item._searchMatch === "tag" && (
          <div style={{ fontSize: s.cellFont, color: T.accent, fontFamily: T.fontMono, marginTop: 1 }}>
            matched tag: {item._searchMatchValue}
          </div>
        )}
      </div>

      {/* Type */}
      <span style={{
        display: "block", width: "100%",
        fontSize: s.cellFont - 1, color: cfg.color, fontFamily: T.fontMono,
        letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "center",
      }}>{cfg.label}</span>

      {/* Genre */}
      <span style={{ display: "block", width: "100%", fontSize: s.cellFont, color: T.muted, fontFamily: T.fontMono, textAlign: "center" }}>
        {item.genre || "—"}
      </span>

      {/* Status — click to open the same radial picker the tile hover
          overlay uses, so all statuses are reachable in one click. */}
      <span
        ref={statusCellRef}
        onClick={e => {
          e.stopPropagation();
          if (statusCellRef.current) setWheelAnchorRect(statusCellRef.current.getBoundingClientRect());
        }}
        style={{ display: "block", width: "100%", fontSize: s.cellFont, color: statusColor, fontFamily: T.fontMono, textTransform: "capitalize", textAlign: "center", cursor: "pointer" }}
      >
        {item.status}
      </span>

      {/* Year */}
      <span style={{ display: "block", width: "100%", fontSize: s.cellFont, color: T.muted, fontFamily: T.fontMono, textAlign: "center" }}>
        {item.year || "—"}
      </span>

      {/* Rating — small ±1 nudge either side of the value. */}
      <div onClick={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 2 }}>
        <button
          onClick={() => onQuickSave(item.id, { rating: nudgeRatingValue(item.rating, -1) })}
          title="Lower rating"
          style={{
            width: 12, height: 12, padding: 0, lineHeight: 1,
            background: "transparent", border: "none",
            color: T.muted, fontSize: s.cellFont, cursor: "pointer",
          }}
        >−</button>
        <span style={{
          fontSize: s.cellFont, fontFamily: T.fontMono, minWidth: 18, textAlign: "center",
          color: ratingColor(item.rating),
        }}>
          {formatRating(item.rating)}
        </span>
        <button
          onClick={() => onQuickSave(item.id, { rating: nudgeRatingValue(item.rating, 1) })}
          title="Raise rating"
          style={{
            width: 12, height: 12, padding: 0, lineHeight: 1,
            background: "transparent", border: "none",
            color: T.muted, fontSize: s.cellFont, cursor: "pointer",
          }}
        >+</button>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={e => e.stopPropagation()}>
        <span
          onClick={() => onQuickSave(item.id, buildOwnedChangePatch(item, !item.is_local))}
          title={item.is_local ? "Owned locally — click to mark as not owned" : item.owned_elsewhere ? "Marked owned on your phone — click to also mark it owned here" : "Not owned — click to mark as owned locally"}
          style={{
            fontSize: s.cellFont + 3, lineHeight: 1, cursor: "pointer",
            color: isOwned(item) ? T.purple : T.muted,
          }}
        >{isOwned(item) ? "●" : "○"}</span>
        {onToggleFavourite && (
          <span
            onClick={() => onToggleFavourite(item.id)}
            onMouseEnter={() => setFavHovered(true)}
            onMouseLeave={() => setFavHovered(false)}
            title={isFavourite ? "Remove from Favourites" : "Add to Favourites"}
            style={{
              fontSize: s.cellFont + 4, lineHeight: 1, cursor: "pointer",
              color: favHovered ? FAVOURITE_HOVER : isFavourite ? T.accent : T.muted,
              transition: "color 0.12s",
            }}
          >{isFavourite ? "★" : "☆"}</span>
        )}
        {onToggleHidden && (
          <span
            onClick={() => onToggleHidden(item)}
            title={item.is_hidden === 1 ? "Unhide" : "Hide"}
            style={{
              fontSize: s.cellFont + 2, lineHeight: 1, cursor: "pointer",
              color: item.is_hidden === 1 ? T.accent : T.muted,
            }}
          >👁</span>
        )}
        <button
          onClick={() => onEdit(item)}
          style={{
            padding: "3px 8px", background: "transparent",
            border: `1px solid ${T.border}`, borderRadius: 3,
            color: T.muted, fontSize: 10, cursor: "pointer",
          }}
        >Edit</button>
        <button
          onClick={() => onDeleteRequest(item)}
          style={{
            padding: "3px 6px", background: "transparent",
            border: "1px solid rgba(232,75,110,0.3)", borderRadius: 3,
            color: "#e84b6e", fontSize: 10, cursor: "pointer",
          }}
        >✕</button>
      </div>
    </div>
    {wheelAnchorRect && (
      <StatusWheel
        current={item.status}
        anchorRect={wheelAnchorRect}
        onSelect={status => onQuickSave(item.id, buildStatusChangePatch(item, status))}
        onClose={() => setWheelAnchorRect(null)}
      />
    )}
    </>
  );
};

// ── Main grid component ────────────────────────────────────────────────────
const TILE_WIDTHS = { small: 90, medium: 140, large: 200 };
const TILE_GAPS   = { small: 1,  medium: 12,   large: 24  };

export default function LibraryGrid({ items, hasUnfilteredItems = false, view, tileSize = "medium", tileGap = "small", tileOverlay = "full", listRowSize = "medium", scrollSpeed = "medium", sort, onSortChange, activeTab = "All", onView, onEdit, onDeleteRequest, onQuickSave, selectedIds = new Set(), onToggleSelect, favouritesListId, onToggleFavourite, onToggleHidden, customTypes = [], initialScrollOffset = 0, onScrollOffsetChange }) {
  // Both views render through one virtualizer that only mounts the rows near
  // the viewport — at ~1900 items, mounting every PosterCard/ListRow at once
  // is what made scrolling jittery, since each tile carries its own state
  // and a ResizeObserver.
  const scrollContainerRef = useRef(null);

  // CSS grid's `auto-fill` picks its own column count from the container's
  // width — virtualizing by row means replicating that math ourselves so row
  // grouping matches what auto-fill would lay out. Measured in a layout
  // effect so the first paint has the right value, not a 1-column guess.
  const [containerWidth, setContainerWidth] = useState(0);
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setContainerWidth(el.clientWidth);
    const ro = new ResizeObserver(entries => setContainerWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // LibraryGrid unmounts whenever Item Profile opens (see App.jsx) — restore
  // wherever the user last scrolled to instead of snapping back to the top.
  useLayoutEffect(() => {
    if (scrollContainerRef.current && initialScrollOffset) {
      scrollContainerRef.current.scrollTop = initialScrollOffset;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Every wheel/trackpad tick is capped (per scrollSpeed) and then eased
  // toward its target over several animation frames instead of jumping
  // scrollTop there instantly. Two problems this solves together: (1) a fast
  // fling (a big flick, or a high-resolution mouse's large per-notch delta)
  // used to be able to jump several virtualized rows at once, landing past
  // overscan's warm buffer before those rows' cover art had time to decode,
  // showing a blank flash — spreading the same distance across ~10 frames
  // gives decode time to catch up regardless of the cap; (2) capped-but-
  // instant scrolling still felt like discrete steps rather than smooth
  // motion, which the easing now fixes directly. A native (non-passive)
  // listener is required: React's synthetic onWheel is attached passively
  // by default, so preventDefault() inside it doesn't actually stop native
  // scrolling.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const maxTickPx = SCROLL_SPEED_CAPS[scrollSpeed] ?? SCROLL_SPEED_CAPS.medium;
    const EASE = 0.22;
    let targetTop = el.scrollTop;
    let rafId = null;

    const step = () => {
      const current = el.scrollTop;
      const diff = targetTop - current;
      if (Math.abs(diff) < 0.5) {
        el.scrollTop = targetTop;
        rafId = null;
        return;
      }
      el.scrollTop = current + diff * EASE;
      rafId = requestAnimationFrame(step);
    };

    const handleWheel = (e) => {
      e.preventDefault();
      const delta = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), maxTickPx);
      const maxScroll = el.scrollHeight - el.clientHeight;
      targetTop = Math.max(0, Math.min(targetTop + delta, maxScroll));
      if (rafId == null) rafId = requestAnimationFrame(step);
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheel);
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [scrollSpeed]);
  const handleScroll = () => {
    if (onScrollOffsetChange && scrollContainerRef.current) onScrollOffsetChange(scrollContainerRef.current.scrollTop);
  };

  // On the "All" tab items mix types, but PosterCard always frames "All" at
  // 2:3 regardless of type (letterboxing square art) so row height is
  // uniform. Every other tab is single-type, so peeking at the first item's
  // type is safe once mixedView is ruled out.
  const isMixedView = activeTab === "All";
  const squareArt = !isMixedView && items[0] && isSquareArt(items[0].media_type);
  const tileGapPx = TILE_GAPS[tileGap];
  const tileMinWidth = TILE_WIDTHS[tileSize];
  const columns = containerWidth > 0
    ? Math.max(1, Math.floor((containerWidth + tileGapPx) / (tileMinWidth + tileGapPx)))
    : 1;
  const tileWidth = containerWidth > 0 ? (containerWidth - tileGapPx * (columns - 1)) / columns : tileMinWidth;
  const tileHeight = tileWidth * (squareArt ? 1 : 1.5);
  const tileRowCount = Math.ceil(items.length / columns);
  const listRowSizePx = listRowHeight(listRowSize);

  const rowVirtualizer = useVirtualizer({
    count: view === "tile" ? tileRowCount : items.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => (view === "tile" ? tileHeight + tileGapPx : listRowSizePx),
    // Wider than the library default (6) — a fast fling-scroll can jump past
    // a thin buffer before the next render catches up, showing a blank gap.
    // More rows kept warm above/below gives fast scrolling more room to land
    // inside already-mounted content.
    overscan: 16,
    initialOffset: initialScrollOffset,
  });
  // Sizing inputs can all change without the row *count* changing — the
  // virtualizer needs an explicit nudge to re-measure, since it otherwise
  // only reacts to `count`.
  useEffect(() => { rowVirtualizer.measure(); }, [columns, tileHeight, view, listRowSizePx]);

  if (items.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <EmptyState hasItems={hasUnfilteredItems} />
      </div>
    );
  }

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  return (
    <div ref={scrollContainerRef} onScroll={handleScroll} style={{ flex: 1, overflowY: "auto" }}>
      {view === "tile" ? (
        <div style={{ position: "relative", height: totalSize }}>
          {virtualRows.map(virtualRow => {
            const start = virtualRow.index * columns;
            const rowItems = items.slice(start, start + columns);
            return (
              <div key={virtualRow.index} style={{
                position: "absolute", top: 0, left: 0, width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
                display: "grid",
                gridTemplateColumns: `repeat(${columns}, 1fr)`,
                gap: tileGapPx,
              }}>
                {rowItems.map(item => (
                  <PosterCard
                    key={item.id}
                    item={item}
                    tileSize={tileSize}
                    tileOverlay={tileOverlay}
                    activeTab={activeTab}
                    showTypeIcon={true}
                    onView={onView}
                    onDeleteRequest={onDeleteRequest}
                    onQuickSave={onQuickSave}
                    selected={selectedIds.has(item.id)}
                    onToggleSelect={onToggleSelect}
                    isFavourite={favouritesListId != null && (item.list_ids || []).includes(favouritesListId)}
                    onToggleFavourite={onToggleFavourite}
                    onToggleHidden={onToggleHidden}
                    customTypes={customTypes}
                  />
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div>
          {/* List header — a normal sticky sibling above the virtualized
              rows; virtualizing the rows below doesn't change how it pins
              to the scroll container. */}
          <div style={{
            display: "grid",
            gridTemplateColumns: listGridColumns(listRowSize),
            padding: "6px 14px", gap: 8,
            borderBottom: `1px solid ${T.border}`,
            background: T.topbar, position: "sticky", top: 0, zIndex: 10,
            fontSize: 8, color: T.muted,
            fontFamily: T.fontMono, letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}>
            <span></span><span></span><span></span>
            <SortableHeader label="Title" sort={sort} onSortChange={onSortChange}
              options={[{ value: "A–Z", arrow: "▲" }, { value: "Z–A", arrow: "▼" }]} />
            <SortableHeader label="Type" align="center" sort={sort} onSortChange={onSortChange}
              options={[{ value: "Type A–Z", arrow: "▲" }, { value: "Type Z–A", arrow: "▼" }]} />
            <SortableHeader label="Genre" align="center" sort={sort} onSortChange={onSortChange}
              options={[{ value: "Genre A–Z", arrow: "▲" }, { value: "Genre Z–A", arrow: "▼" }]} />
            <SortableHeader label="Status" align="center" sort={sort} onSortChange={onSortChange}
              options={[{ value: "Status ↑", arrow: "▲" }, { value: "Status ↓", arrow: "▼" }]} />
            <SortableHeader label="Year" align="center" sort={sort} onSortChange={onSortChange}
              options={[{ value: "Year ↓", arrow: "▼" }, { value: "Year ↑", arrow: "▲" }]} />
            <SortableHeader label="Rating" align="center" sort={sort} onSortChange={onSortChange}
              options={[{ value: "Rating ↓", arrow: "▼" }, { value: "Rating ↑", arrow: "▲" }]} />
            <span>Actions</span>
          </div>

          <div style={{ position: "relative", height: totalSize }}>
            {virtualRows.map(virtualRow => {
              const item = items[virtualRow.index];
              return (
                <div key={item.id} style={{
                  position: "absolute", top: 0, left: 0, width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}>
                  <ListRow
                    item={item}
                    index={virtualRow.index}
                    size={listRowSize}
                    onView={onView}
                    onEdit={onEdit}
                    onDeleteRequest={onDeleteRequest}
                    onQuickSave={onQuickSave}
                    isFavourite={favouritesListId != null && (item.list_ids || []).includes(favouritesListId)}
                    onToggleFavourite={onToggleFavourite}
                    onToggleHidden={onToggleHidden}
                    selected={selectedIds.has(item.id)}
                    onToggleSelect={onToggleSelect}
                    customTypes={customTypes}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
