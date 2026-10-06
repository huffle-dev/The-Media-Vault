import { useState, useRef, useLayoutEffect, useEffect, memo } from "react";
import { createPortal } from "react-dom";
import { T, getEffectiveTypeConfig, formatRating, ratingColor, buildStatusChangePatch, STATUS_WHEEL_ORDER, launchAction, isSquareArt, isWideArt, isOwned } from "../tokens.js";
import ArtImage from "./ArtImage.jsx";

const MIN_ACTION_SCALE = 0.55;

// critic_rating is a display string like "IMDb 8.4/10 · RT 87% · Metacritic 74"
// or "TMDB 7.9/10 (12,345 votes)" — shorten to just the leading source+score for the tile.
const shortCriticRating = (criticRating) => {
  if (!criticRating) return null;
  return criticRating.split(" · ")[0].replace(/\s*\(.*?\)\s*/, "").trim();
};

const TILE_FONTS = {
  small:  { title: 9,  meta: 7  },
  medium: { title: 11, meta: 9  },
  large:  { title: 13, meta: 10 },
};

// The shared `runtime` column means different units per type — Book stores
// page count, Game stores hours, everything else stores minutes.
const RUNTIME_UNIT = { Book: "p", Game: "h" };
const runtimeUnit = (mediaType) => RUNTIME_UNIT[mediaType] || "m";

// LibraryGrid's row virtualizer already bounds the mounted-tile count to
// roughly the viewport + overscan, so this isn't the library-scale
// bottleneck memoizing a component usually targets — but without memo, any
// LibraryGrid re-render (a scroll offset change, a sibling tile's own local
// state) still re-renders every currently-mounted tile even when a given
// tile's own props haven't changed. Cheap to avoid since the callback props
// LibraryGrid passes through (onView, onQuickSave, etc.) are already stable
// useCallback references from App.jsx's hooks.
function PosterCard({ item, tileSize = "medium", tileOverlay = "full", showTypeIcon = true, activeTab = "All", customTypes = [], onView, onDeleteRequest, onQuickSave, selected = false, onToggleSelect, isFavourite = false, onToggleFavourite, onToggleHidden }) {
  const [hovered, setHovered]     = useState(false);
  const [localItem, setLocalItem] = useState(item);
  const cfg = getEffectiveTypeConfig(localItem, customTypes);

  const cardRef    = useRef(null);
  const actionsRef = useRef(null);
  const statusBtnRef = useRef(null);
  const [actionScale, setActionScale] = useState(1);
  // Captured once at open-time rather than read live off statusBtnRef — the
  // trigger button only exists while `hovered` is true, and moving the
  // mouse to a wheel item outside the tile's edge immediately flips
  // `hovered` false, unmounting the button right when the wheel needs it.
  const [wheelAnchorRect, setWheelAnchorRect] = useState(null);
  // The tile's own rect, captured alongside wheelAnchorRect — centers the
  // vertical-line fallback layout on the tile itself. The status button
  // sits above the tile's true center (first item in the hover action
  // stack), so anchoring on the button's own rect would land it too high.
  const [tileRect, setTileRect] = useState(null);
  // True from the optimistic setLocalItem in saveField until onQuickSave
  // resolves — guards the resync-from-props line below from reverting a
  // just-made local edit, since `hovered` has already flipped false by the
  // time a StatusWheel click lands (see note above).
  const pendingSaveRef = useRef(false);

  // Scale the action-button stack down to fit the card when it's taller than
  // the available space — measured, not a fixed tier, so it adapts
  // continuously to whatever tile size is in play.
  useLayoutEffect(() => {
    if (!hovered) return;
    const measure = () => {
      const card    = cardRef.current;
      const actions = actionsRef.current;
      if (!card || !actions) return;
      const available = card.getBoundingClientRect().height - 12; // breathing room
      const natural   = actions.scrollHeight;
      const scale     = natural > available ? Math.max(MIN_ACTION_SCALE, available / natural) : 1;
      setActionScale(scale);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (cardRef.current) ro.observe(cardRef.current);
    return () => ro.disconnect();
  }, [hovered, localItem.status, localItem.local_path, localItem.platform_id, localItem.is_local, localItem.imdb_url, localItem.steam_url]);

  // Keep local state in sync if parent updates the item
  if (item !== localItem && !hovered && !pendingSaveRef.current) setLocalItem(item);

  const statusColor = STATUS_COLOR_MAP[localItem.status] || T.blue;

  const saveField = async (patch) => {
    const updated = { ...localItem, ...patch };
    pendingSaveRef.current = true;
    setLocalItem(updated);
    try { await onQuickSave(localItem.id, patch); } catch {} finally { pendingSaveRef.current = false; }
  };


  const setStatus = (status) => {
    saveField(buildStatusChangePatch(localItem, status));
  };

  // Square cover art (Music, Podcast, Board Game, Audiobook): a single-type
  // tab is square, art fills it edge to edge. "All"/mixed tab: tile matches
  // everyone else's 2:3 frame (so every icon/badge/overlay sits in the same
  // spot) and the art renders at its natural 1:1 shape, letterboxed top/
  // bottom with that type's own gradient.
  const squareArt = isSquareArt(localItem.media_type);
  const isMixedView = activeTab === "All";
  const letterboxSquareArt = squareArt && isMixedView;

  return (
    <>
    <div
      ref={cardRef}
      style={{
        position: "relative",
        aspectRatio: (squareArt && !isMixedView) ? "1/1" : "2/3",
        background: localItem.cover_art_path ? "transparent" : cfg.gradient,
        cursor: "pointer",
        overflow: "hidden",
        flexShrink: 0,
        opacity: localItem.is_hidden === 1 && !hovered ? 0.5 : 1,
        transition: "opacity 0.12s",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onView(localItem)}
    >
      {/* Cover art or placeholder */}
      {letterboxSquareArt ? (
        <div style={{
          position: "relative", width: "100%", height: "100%",
          overflow: "hidden", display: "flex",
          alignItems: "center", justifyContent: "center",
          background: `${cfg.color}33`,
        }}>
          {localItem.cover_art_path ? (
            <>
              {/* Blurred, dimmed, oversized copy of the same art fills the
                  full 2:3 frame behind the sharp square tile, scoped to the
                  mixed "All" tab only. `inset: -10` overshoots the box so
                  blur(...)'s edge softening falls outside the clipped area
                  instead of leaving a visible lighter border. */}
              <img
                src={`file://${localItem.cover_art_path}`}
                alt=""
                aria-hidden="true"
                decoding="async"
                style={{
                  position: "absolute", inset: -10,
                  objectFit: "cover", filter: "blur(16px) brightness(0.5)",
                }}
              />
              <img
                src={`file://${localItem.cover_art_path}`}
                alt={localItem.title}
                decoding="async"
                style={{
                  position: "relative", width: "100%", aspectRatio: isWideArt(localItem) ? "16/9" : "1/1",
                  objectFit: "cover", display: "block",
                  boxShadow: "0 6px 18px rgba(0,0,0,0.55)",
                }}
                onError={e => { e.target.style.display = "none"; }}
              />
            </>
          ) : (
            <div style={{ width: "100%", aspectRatio: "1/1", background: cfg.gradient }} />
          )}
        </div>
      ) : localItem.cover_art_path ? (
        <ArtImage
          src={`file://${localItem.cover_art_path}`}
          alt={localItem.title}
          wide={isWideArt(localItem)}
          onError={e => { e.target.style.display = "none"; }}
        />
      ) : (
        <div style={{ width: "100%", height: "100%", background: cfg.gradient }} />
      )}

      {/* Checkbox */}
      {(hovered || selected) && (
        <CornerCheckbox selected={selected} onClick={e => { e.stopPropagation(); onToggleSelect(localItem.id); }} />
      )}

      {/* Media type icon */}
      {!hovered && showTypeIcon && (tileOverlay === "full" || !localItem.cover_art_path) && (
        <div style={{
          position: "absolute", top: 4, right: 5,
          fontSize: 22, lineHeight: 1, zIndex: 3,
          filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.9))",
          opacity: !localItem.cover_art_path && tileOverlay !== "full" ? 0.35 : 1,
        }}>{cfg.icon}</div>
      )}

      {/* Favourites toggle — same corner as the media type icon, so it only
          shows on hover once that icon has hidden itself. */}
      {hovered && onToggleFavourite && (
        <CornerFavourite isFavourite={isFavourite} onClick={e => { e.stopPropagation(); onToggleFavourite(localItem.id); }} />
      )}

      {/* Delete — bottom-right corner, centered under the favourite toggle,
          instead of a full-width button in the action stack, since
          destructive actions shouldn't carry the same visual weight. */}
      {hovered && (
        <CornerDelete onClick={e => { e.stopPropagation(); onDeleteRequest(localItem); }} />
      )}

      {/* Hide/Unhide — bottom-left, hover-only unless the item is actually
          hidden, so a hidden tile stays identifiable without hovering. */}
      {onToggleHidden && (hovered || localItem.is_hidden === 1) && (
        <CornerHide isHidden={localItem.is_hidden === 1} onClick={e => { e.stopPropagation(); onToggleHidden(localItem); }} />
      )}

      {/* Content rating badge — Film/TV only, same visibility rule as the media type icon.
          Small tiles stack it just below the icon instead of the bottom-right corner. */}
      {!hovered && showTypeIcon && (tileOverlay === "full" || !localItem.cover_art_path) &&
       (localItem.media_type === "Movie" || localItem.media_type === "TV") && localItem.content_rating && (
        <div style={{
          position: "absolute", zIndex: 3,
          ...(tileSize === "small" ? { top: 27, right: 5 } : { bottom: 5, right: 5 }),
          fontSize: 8, fontFamily: T.fontMono, letterSpacing: "0.03em",
          padding: "2px 5px", borderRadius: 3,
          background: "rgba(0,0,0,0.55)", color: T.text,
          border: `1px solid ${T.border}`,
          opacity: !localItem.cover_art_path && tileOverlay !== "full" ? 0.35 : 1,
        }}>{localItem.content_rating}</div>
      )}

      {/* Status dot — fill = status. A second, equal-size dot appears next
          to it when owned locally, instead of a ring (too hard to tell
          apart at this size). Same corner as the selection checkbox, so
          both hide whenever that's showing. */}
      {!hovered && !selected && showTypeIcon && (tileOverlay === "full" || !localItem.cover_art_path) && (
        <div style={{
          position: "absolute", top: 6, left: 6, zIndex: 3,
          display: "flex", gap: 4,
          opacity: !localItem.cover_art_path && tileOverlay !== "full" ? 0.35 : 1,
        }}>
          <div style={{
            width: 10, height: 10, borderRadius: "50%", boxSizing: "border-box",
            background: statusColor,
            border: "1.5px solid rgba(255,255,255,0.35)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.6)",
          }} />
          {isOwned(localItem) && (
            <div style={{
              width: 10, height: 10, borderRadius: "50%", boxSizing: "border-box",
              background: T.purple,
              border: "1.5px solid rgba(255,255,255,0.35)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.6)",
            }} />
          )}
        </div>
      )}

      {/* Bottom info overlay */}
      {(tileOverlay !== "none" || !localItem.cover_art_path) && (
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(to top, rgba(5,5,10,0.96) 0%, rgba(5,5,10,0.3) 45%, transparent 100%)",
        display: "flex", flexDirection: "column", justifyContent: "flex-end",
        padding: "6px 5px 5px", zIndex: 2,
        opacity: (!localItem.cover_art_path && tileOverlay === "none") ? 0.35 : 1,
      }}>
        {(() => {
          const fs = TILE_FONTS[tileSize] ?? TILE_FONTS.medium;
          return (<>
            <div style={{
              fontFamily: T.fontSerif,
              fontSize: fs.title, color: "#fff", lineHeight: 1.25, marginBottom: 2,
              textShadow: "0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6)",
            }}>{localItem.title}</div>
            {localItem._searchMatch && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                marginBottom: 3, padding: "1px 6px", borderRadius: 4,
                background: "rgba(232,184,75,0.15)", border: "1px solid rgba(232,184,75,0.3)",
                width: "fit-content", maxWidth: "100%",
              }}>
                <span style={{
                  fontSize: 9, color: T.accent, fontFamily: T.fontMono,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  matched {localItem._searchMatch === "cast" ? "cast" : localItem._searchMatch === "tag" ? "tag" : "creator"}: {localItem._searchMatchValue}
                </span>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {localItem.genre && (
                <div style={{
                  fontSize: fs.meta, color: cfg.color,
                  fontFamily: T.fontMono,
                  letterSpacing: "0.03em",
                  textShadow: "0 1px 3px rgba(0,0,0,0.9)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{localItem.genre}</div>
              )}
              {localItem.runtime && (
                <div style={{ fontSize: fs.meta, color: T.dim, fontFamily: T.fontMono, textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}>
                  {localItem.runtime}{runtimeUnit(localItem.media_type)}
                </div>
              )}
              {(localItem.critic_rating || localItem.rating != null) && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: fs.meta, fontFamily: T.fontMono, textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}>
                  {localItem.critic_rating && <span style={{ color: T.dim }}>{shortCriticRating(localItem.critic_rating)}</span>}
                  {localItem.critic_rating && localItem.rating != null && <span style={{ color: T.muted }}>-</span>}
                  {localItem.rating != null && <span style={{ color: ratingColor(localItem.rating) }}>{formatRating(localItem.rating)}</span>}
                </div>
              )}
              {localItem.year && (
                <div style={{ fontSize: fs.meta, color: T.muted, fontFamily: T.fontMono, textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}>
                  {localItem.year}
                </div>
              )}
            </div>
          </>);
        })()}
      </div>
      )}

      {/* Hover overlay */}
      {hovered && (
        <div
          style={{
            position: "absolute", inset: 0, zIndex: 4,
            background: "rgba(5,5,10,0.82)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Button stack — scaled down to fit when it's taller than the card */}
          <div
            ref={actionsRef}
            style={{
              display: "flex", flexDirection: "column",
              alignItems: "center", gap: 5,
              transform: actionScale < 1 ? `scale(${actionScale})` : undefined,
              transformOrigin: "center",
            }}
          >
          {/* Status button — opens a radial picker instead of cycling, so
              jumping from e.g. Wishlist to Dropped skips the steps between. */}
          <div ref={statusBtnRef} style={{ display: "inline-block" }}>
            <StatusCycleBtn status={localItem.status} onClick={() => {
              if (statusBtnRef.current) setWheelAnchorRect(statusBtnRef.current.getBoundingClientRect());
              if (cardRef.current) setTileRect(cardRef.current.getBoundingClientRect());
            }} />
          </div>

          {localItem.local_path && (
            <ActionBtn onClick={() => window.vault.shell.openPath(localItem.local_path)} color={T.purple}>📁 Folder</ActionBtn>
          )}
          {launchAction(localItem) && (
            <ActionBtn onClick={launchAction(localItem)} color="#4be8c8">▶ Launch</ActionBtn>
          )}
          <ActionBtn onClick={() => onView(localItem)} color={T.bg} bg={T.accent} fontWeight={700}>View</ActionBtn>
          </div>
        </div>
      )}
    </div>
    {/* Rendered as a sibling of the card, not a descendant — a
        position:fixed wheel item nested inside the action stack's scale
        transform would become relative to that transform (any CSS
        transform creates a new containing block for fixed descendants),
        and nested in the card, moving onto a wheel item outside the tile's
        edge would fire onMouseLeave and collapse the overlay before a
        click could land. Staying independent of `hovered` keeps it open. */}
    {wheelAnchorRect && (
      <StatusWheel
        current={localItem.status}
        anchorRect={wheelAnchorRect}
        tileRect={tileRect}
        onSelect={setStatus}
        onClose={() => { setWheelAnchorRect(null); setTileRect(null); }}
      />
    )}
    </>
  );
}

export default memo(PosterCard);

// Getters, not plain values — applyThemeOverrides() mutates T in place, and
// a plain object literal would capture T.blue etc. as frozen strings at
// module-load time, never reflecting a later Appearance customization.
export const STATUS_COLOR_MAP = {
  get wishlist()       { return T.blue; },
  get "not-started"()  { return T.notStarted; },
  get "in-progress"()  { return T.progress; },
  get consumed()       { return T.seen; },
  get dropped()        { return T.dropped; },
};
export const STATUS_LABEL_MAP = { wishlist: "Wishlist", "not-started": "Not Started", "in-progress": "In Progress", consumed: "Consumed", dropped: "Dropped" };

// Hover colors here are deliberately literal, not theme tokens — favourite
// hovers yellow and delete hovers red regardless of accent, so they read as
// "this is what this action does" rather than blending in.
export const FAVOURITE_HOVER = "#f5c518";
export const DELETE_HOVER = "#e84b6e";

const CornerCheckbox = ({ selected, onClick }) => {
  const [h, setH] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        position: "absolute", top: 5, left: 5,
        width: 16, height: 16, borderRadius: 3, zIndex: 10,
        border: `1.5px solid ${selected || h ? T.accent : "rgba(255,255,255,0.5)"}`,
        background: selected ? T.accent : h ? T.accent + "33" : "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", transition: "background 0.12s, border-color 0.12s",
      }}
    >
      {selected && <span style={{ fontSize: 9, color: T.bg, lineHeight: 1 }}>✓</span>}
    </div>
  );
};

// Doubled to 32px (from the checkbox/delete's 16px) — it was too small to
// reliably click before.
const CornerFavourite = ({ isFavourite, onClick }) => {
  const [h, setH] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      title={isFavourite ? "Remove from Favourites" : "Add to Favourites"}
      style={{
        position: "absolute", top: 5, right: 5, zIndex: 10,
        width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 26, lineHeight: 1, cursor: "pointer",
        color: h ? FAVOURITE_HOVER : isFavourite ? T.accent : "rgba(255,255,255,0.6)",
        filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.9))",
        transition: "color 0.12s",
      }}
    >{isFavourite ? "★" : "☆"}</div>
  );
};

const CornerDelete = ({ onClick }) => {
  const [h, setH] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      title="Delete"
      style={{
        // Bottom-right corner, horizontally centered on the same vertical
        // line as the (32px) favourite star — right:9 not right:5, since
        // this button is 24px, 8px narrower.
        position: "absolute", bottom: 5, right: 9, zIndex: 10,
        width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 19, lineHeight: 1, cursor: "pointer",
        color: h ? DELETE_HOVER : "rgba(255,255,255,0.6)",
        filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.9))",
        transition: "color 0.12s",
      }}
    >🗑️</div>
  );
};

// Bottom-left corner — the one remaining free spot (checkbox/status dots
// top-left, favourite/type-icon top-right, delete bottom-right). Same 👁
// glyph for both states — dimmed/idle to hide, colored/active to unhide —
// so a hidden tile reads as such at a glance.
const CornerHide = ({ isHidden, onClick }) => {
  const [h, setH] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      title={isHidden ? "Unhide" : "Hide"}
      style={{
        position: "absolute", bottom: 5, left: 5, zIndex: 10,
        width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 28, lineHeight: 1, cursor: "pointer",
        color: h ? T.text : isHidden ? T.accent : "rgba(255,255,255,0.6)",
        filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.9))",
        transition: "color 0.12s",
      }}
    >👁</div>
  );
};

const StatusCycleBtn = ({ status, onClick }) => {
  const [h, setH] = useState(false);
  const color = STATUS_COLOR_MAP[status] || T.blue;
  const label = STATUS_LABEL_MAP[status] || status;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        padding: "4px 0", width: 80, borderRadius: 4, fontSize: 10,
        cursor: "pointer", fontFamily: T.fontSans, fontWeight: 600,
        border: `1px solid ${color}66`,
        color, background: h ? color + "33" : color + "18",
        transition: "background 0.1s",
      }}
    >{label}</button>
  );
};

// Status picker — pops out of the tile entirely (position:fixed off the
// trigger button's own measured rect, same as TopBar's dropdowns and
// Settings' emoji picker) rather than rendering inside the hover overlay,
// so it's never squeezed by the tile size or the action stack's scale
// transform. All statuses are always shown, including the current one
// (ringed), so picking is a single click. Exported so ListRow can reuse it.
export const StatusWheel = ({ current, anchorRect, tileRect, onSelect, onClose }) => {
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rect = anchorRect;
  const itemW = 84, itemH = 22, gap = 6;
  const n = STATUS_WHEEL_ORDER.length;
  const pad = 8;
  const vw = window.innerWidth, vh = window.innerHeight;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  // Evenly spaced around a circle (starting at 12 o'clock, clockwise) — the
  // normal case. Radius is the smallest one at which no two buttons overlap
  // (not a fixed spacing), so the circle stays compact and only tiles really
  // at the window's left/right/top/bottom edge lose it.
  const angleOf = (i) => (i / n) * Math.PI * 2 - Math.PI / 2;
  const overlaps = (r) => {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const dx = Math.abs(r * (Math.cos(angleOf(i)) - Math.cos(angleOf(j))));
      const dy = Math.abs(r * (Math.sin(angleOf(i)) - Math.sin(angleOf(j))));
      if (dx < itemW + 6 && dy < itemH + 6) return true;
    }
    return false;
  };
  let r = 40;
  while (r < 200 && overlaps(r)) r += 2;
  // A circle that would poke slightly past a window edge is nudged back in
  // rather than thrown away; only when the nudge would be large (a tile
  // truly on the edge) does it fall back to the vertical line below.
  const maxShift = 50;
  const minX = pad + r + itemW / 2, maxX = vw - pad - r - itemW / 2;
  const minY = pad + r + itemH / 2, maxY = vh - pad - r - itemH / 2;
  const ccx = minX > maxX ? cx : Math.min(Math.max(cx, minX), maxX);
  const ccy = minY > maxY ? cy : Math.min(Math.max(cy, minY), maxY);
  const fitsCircle = minX <= maxX && minY <= maxY && Math.abs(ccx - cx) <= maxShift && Math.abs(ccy - cy) <= maxShift;

  // The fallback: a straight, evenly-spaced vertical line centered over
  // the tile on both axes. Deliberately not clamped to the viewport —
  // centering on the tile wins over guaranteeing every button stays fully
  // on-screen.
  let slotPos;
  if (fitsCircle) {
    slotPos = STATUS_WHEEL_ORDER.map((_, i) => {
      const angle = angleOf(i);
      return {
        left: ccx + r * Math.cos(angle) - itemW / 2,
        top:  ccy + r * Math.sin(angle) - itemH / 2,
      };
    });
  } else {
    // Centered on the tile's own rect when available (PosterCard passes it)
    // rather than the trigger button's rect — the button sits above the
    // tile's true center as the first item in the hover action stack.
    // ListRow has no equivalent "tile" rect, so it falls back to the
    // button's own rect.
    const anchor = tileRect || rect;
    const totalH = n * itemH + (n - 1) * gap;
    const top0 = anchor.top + anchor.height / 2 - totalH / 2;
    const left = anchor.left + anchor.width / 2 - itemW / 2;
    slotPos = STATUS_WHEEL_ORDER.map((_, i) => ({
      left,
      top: top0 + i * (itemH + gap),
    }));
  }

  // Portaled straight to <body> — needs to be a true DOM sibling of the
  // whole app, not just a React-tree sibling of the tile. LibraryGrid's
  // virtualized rows are positioned with `transform: translateY(...)`, and
  // CSS transform on any ancestor creates a new containing block for
  // `position: fixed` descendants — without the portal, this wheel would
  // render relative to that scrolled row instead of the viewport.
  return createPortal((
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 499 }} />
      {STATUS_WHEEL_ORDER.map((status, i) => {
        const pos = slotPos[i];
        const color = STATUS_COLOR_MAP[status];
        const active = status === current;
        return (
          <button
            key={status}
            onClick={() => { onSelect(status); onClose(); }}
            style={{
              position: "fixed", left: pos.left, top: pos.top,
              width: itemW, height: itemH, borderRadius: 4, fontSize: 10,
              cursor: "pointer", fontFamily: T.fontSans, fontWeight: 700,
              border: `${active ? 2 : 1}px solid ${color}`,
              color, background: T.surface,
              boxShadow: "0 4px 14px rgba(0,0,0,0.6)", zIndex: 500,
            }}
          >{STATUS_LABEL_MAP[status]}</button>
        );
      })}
    </>
  ), document.body);
};

const ActionBtn = ({ onClick, color, bg = "transparent", fontWeight = 400, borderColor, children }) => {
  const [h, setH] = useState(false);
  // Solid-background buttons darken via a brightness filter on hover, since
  // a hardcoded hover hex can't track a user-customized accent color.
  // Transparent buttons keep the translucent color-tint hover instead.
  const solid = bg !== "transparent";
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        padding: "4px 0", width: 80, borderRadius: 4, fontSize: 10,
        cursor: "pointer", fontFamily: T.fontSans, fontWeight,
        border: `1px solid ${borderColor || (solid ? "transparent" : color + "55")}`,
        color, background: solid ? bg : (h ? color + "22" : "transparent"),
        filter: solid && h ? "brightness(0.88)" : "none",
        transition: "background 0.1s, filter 0.1s",
      }}
    >{children}</button>
  );
};
