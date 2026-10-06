import { useMemo, useState } from "react";
import { T, getTypeConfig, TYPE_TABS, TYPE_FIELDS, withCustomTypeTabs, effectiveType, ratingToDisplay, externalRatingValue, isOwned } from "../tokens.js";

// Map media_type → display label matching the top bar tabs
const TYPE_DISPLAY = Object.fromEntries(
  TYPE_TABS.filter(t => t.includes?.length === 1)
           .map(t => [t.includes[0], t.label])
);

const TYPES = ["Movie", "TV", "Book", "Audiobook", "Game", "Music"];

// Polar → Cartesian
function pt(cx, cy, r, angle) {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

// SVG donut segment path with 2-degree gap between each slice
function slicePath(cx, cy, outerR, innerR, startAngle, endAngle) {
  const GAP = 0.028; // radians (~1.6°)
  const s = startAngle + GAP;
  const e = endAngle   - GAP;
  if (e - s < 0.01) return "";
  const large = e - s > Math.PI ? 1 : 0;
  const [ox1, oy1] = pt(cx, cy, outerR, s);
  const [ox2, oy2] = pt(cx, cy, outerR, e);
  const [ix1, iy1] = pt(cx, cy, innerR, s);
  const [ix2, iy2] = pt(cx, cy, innerR, e);
  return `M ${ox1} ${oy1} A ${outerR} ${outerR} 0 ${large} 1 ${ox2} ${oy2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 ${large} 0 ${ix1} ${iy1} Z`;
}

// Standalone status-breakdown card (wishlist / in-progress / completed) for a
// single media type, or the whole library via its own "All" option (see
// StatusBreakdownPicker below). "quick" is the TopBar quick-filter value
// each slice maps to when clicked.
const STATUS_PARTS = [
  { key: "wishlist",    label: "Wishlist",    quick: "Wishlist" },
  { key: "notStarted",  label: "Not Started", quick: "Not Started" },
  { key: "inProgress",  label: "In Progress", quick: "In Progress" },
  { key: "consumed",    label: "Consumed",    quick: "Consumed" },
  { key: "dropped",     label: "Dropped",     quick: "Dropped" },
];

// Every slice uses the app's fixed status colors (same ones the TopBar
// quick-filter pills use) instead of a per-type shade — so the same status
// always reads the same color no matter which type is selected.
const STATUS_COLOR = {
  wishlist:   T.blue,
  notStarted: T.notStarted,
  inProgress: T.progress,
  consumed:   T.seen,
  dropped:    T.dropped,
};

// label defaults to the built-in lookup (TYPE_DISPLAY) but can be overridden
// — needed for custom types and "All", neither of which are in it.
function StatusBreakdownCard({ type, row, onNavigate, label, picker }) {
  const [hovered, setHovered] = useState(null);
  const displayLabel = label ?? TYPE_DISPLAY[type] ?? type;
  const total = row.total;
  const go = (quick) => onNavigate(displayLabel, { quickFilter: quick });

  let angle = -Math.PI / 2;
  const parts = STATUS_PARTS
    .map(p => ({
      ...p,
      count: row[p.key],
      color: STATUS_COLOR[p.key],
    }))
    .filter(p => p.count > 0)
    .map(p => {
      const span = (p.count / total) * 2 * Math.PI;
      const startAngle = angle;
      const endAngle = angle + span;
      angle = endAngle;
      return { ...p, startAngle, endAngle, pct: ((p.count / total) * 100).toFixed(1) };
    });

  const CX = 80, CY = 80, OR = 68, IR = 44;

  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 10, padding: "20px 24px", flexShrink: 0,
      display: "flex", alignItems: "center", gap: 24,
    }}>
      <svg viewBox="0 0 160 160" style={{ width: 160, height: 160, flexShrink: 0 }}>
        {parts.map(s => (
          <path
            key={s.key}
            d={slicePath(CX, CY, OR, IR, s.startAngle, s.endAngle)}
            fill={s.color}
            opacity={hovered === null || hovered === s.key ? 1 : 0.3}
            style={{
              cursor: "pointer", transition: "opacity 0.15s, filter 0.15s",
              filter: hovered === s.key ? "brightness(1.15)" : "none",
            }}
            onMouseEnter={() => setHovered(s.key)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => go(s.quick)}
          />
        ))}
        <text x={CX} y={CY - 8} textAnchor="middle" dominantBaseline="middle"
          style={{ fontFamily: T.fontSerif, fontSize: 26, fill: "#e2e2f0" }}
        >{total}</text>
        <text x={CX} y={CY + 14} textAnchor="middle" dominantBaseline="middle"
          style={{ fontFamily: T.fontMono, fontSize: 8, fill: "#55556a", letterSpacing: "0.1em", textTransform: "uppercase" }}
        >{displayLabel.toUpperCase()}</text>
      </svg>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ marginBottom: 4 }}>
          {picker || (
            <span style={{
              fontFamily: T.fontMono, fontSize: 9,
              color: T.muted, letterSpacing: "0.1em", textTransform: "uppercase",
            }}>{displayLabel} Status</span>
          )}
        </div>

        {parts.map(p => (
          <div
            key={p.key}
            onMouseEnter={() => setHovered(p.key)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => go(p.quick)}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              opacity: hovered === null || hovered === p.key ? 1 : 0.4,
              transition: "opacity 0.15s, filter 0.15s", cursor: "pointer",
              filter: hovered === p.key ? "brightness(1.15)" : "none",
            }}
          >
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
            <div style={{
              fontFamily: T.fontSans, fontSize: 13, color: T.text, minWidth: 80,
              textDecoration: hovered === p.key ? "underline" : "none",
            }}>{p.label}</div>
            <div style={{
              fontFamily: T.fontMono, fontSize: 10,
              color: T.muted, minWidth: 72, textAlign: "right",
              fontVariantNumeric: "tabular-nums",
            }}>{p.count} · {p.pct}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Genre is stored as a comma list (a title can carry more than one), so counts
// don't sum to the item total — a horizontal bar reads that correctly where a
// pie chart (which implies slices summing to 100%) would mislead.
const splitGenres = (genreStr) => (genreStr || "").split(",").map(g => g.trim()).filter(Boolean);

// Every built-in type EXCEPT Trading Card Game has a genre-equivalent field
// (labeled differently per type, but all the same `genre` column) — derived
// from TYPE_FIELDS rather than hardcoded, so it stays correct if a type's
// fields change. Custom types store fields in
// `custom_fields` JSON, so neither participates here.
const GENRE_TYPES = Object.keys(TYPE_FIELDS).filter(t => TYPE_FIELDS[t].some(f => f.key === "genre"));

// Combined genre breakdown across every type that has one — each bar is a
// single genre, its segments stacked by media type (each in that type's own
// color, same as the tile/tab colors elsewhere) so "Action" shows how much
// of it is Movies vs Games vs Board Games at a glance, not just a total.
function AllGenresBarChart({ items, onNavigate }) {
  const [hovered, setHovered] = useState(null); // "<genre>::<type>" or null

  const rows = useMemo(() => {
    const byGenre = new Map(); // genre -> { total, byType: Map<type, count> }
    items.forEach(i => {
      if (!GENRE_TYPES.includes(i.media_type)) return;
      splitGenres(i.genre).forEach(g => {
        if (!byGenre.has(g)) byGenre.set(g, { genre: g, total: 0, byType: new Map() });
        const entry = byGenre.get(g);
        entry.total += 1;
        entry.byType.set(i.media_type, (entry.byType.get(i.media_type) || 0) + 1);
      });
    });
    return [...byGenre.values()]
      .map(g => ({
        ...g,
        // Fixed GENRE_TYPES order rather than by-count — so Movies (say) is
        // always the leftmost segment whenever present, and every bar reads
        // left-to-right consistently instead of reshuffling per row.
        segments: [...g.byType.entries()]
          .map(([type, count]) => ({ type, count, color: getTypeConfig(type).color }))
          .sort((a, b) => GENRE_TYPES.indexOf(a.type) - GENRE_TYPES.indexOf(b.type)),
      }))
      .sort((a, b) => b.total - a.total);
  }, [items]);

  if (rows.length === 0) return null;
  const max = rows[0].total;

  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 10, padding: "20px 24px", marginBottom: 12,
    }}>
      <div style={{
        fontFamily: T.fontMono, fontSize: 9,
        color: T.muted, letterSpacing: "0.1em", textTransform: "uppercase",
        marginBottom: 10,
      }}>All Genres</div>

      {/* Type-color key — necessary since a single bar can carry many colors
          at once. Shows every genre-bearing type, not just ones with data
          right now, so the key stays stable as the library grows. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", marginBottom: 16 }}>
        {GENRE_TYPES.map(type => (
          <div key={type} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: getTypeConfig(type).color, flexShrink: 0 }} />
            <span style={{ fontFamily: T.fontMono, fontSize: 9, color: T.muted }}>{TYPE_DISPLAY[type] ?? type}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map(g => (
          <div key={g.genre} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 110, flexShrink: 0, fontSize: 12, color: T.text,
              fontFamily: T.fontSans, textAlign: "right",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>{g.genre}</div>
            <div style={{ flex: 1, display: "flex", gap: 1, height: 14 }}>
              {g.segments.map(s => {
                const key = `${g.genre}::${s.type}`;
                return (
                  <div
                    key={s.type}
                    onMouseEnter={() => setHovered(key)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => onNavigate(TYPE_DISPLAY[s.type] ?? s.type, { genre: g.genre })}
                    title={`${TYPE_DISPLAY[s.type] ?? s.type}: ${s.count}`}
                    style={{
                      width: `${(s.count / max) * 100}%`, height: "100%",
                      background: s.color, borderRadius: 3,
                      opacity: hovered === null || hovered === key ? 1 : 0.4,
                      filter: hovered === key ? "brightness(1.15)" : "none",
                      cursor: "pointer", transition: "opacity 0.15s, filter 0.15s",
                    }}
                  />
                );
              })}
            </div>
            <div style={{
              width: 26, flexShrink: 0, fontSize: 11, color: T.dim,
              fontFamily: T.fontMono, textAlign: "right",
              fontVariantNumeric: "tabular-nums",
            }}>{g.total}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Lists are cross-media, so unlike the genre/age-rating/rating charts this
// isn't split per type — one chart, whole library, using the item_count
// the lists IPC already returns rather than recomputing membership.
function ListBarChart({ lists, onNavigate }) {
  const [hovered, setHovered] = useState(null);

  const withItems = [...lists].filter(l => l.item_count > 0).sort((a, b) => b.item_count - a.item_count);
  if (withItems.length === 0) return null;
  const max = withItems[0].item_count;

  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 10, padding: "20px 24px", marginBottom: 24,
    }}>
      <div style={{
        fontFamily: T.fontMono, fontSize: 9,
        color: T.muted, letterSpacing: "0.1em", textTransform: "uppercase",
        marginBottom: 14,
      }}>Lists</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {withItems.map(l => (
          <div
            key={l.id}
            onMouseEnter={() => setHovered(l.id)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onNavigate("All", { list: l.id })}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              opacity: hovered === null || hovered === l.id ? 1 : 0.4,
              transition: "opacity 0.15s, filter 0.15s", cursor: "pointer",
              filter: hovered === l.id ? "brightness(1.15)" : "none",
            }}
          >
            <div style={{
              width: 110, flexShrink: 0, fontSize: 12, color: T.text,
              fontFamily: T.fontSans, textAlign: "right",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              textDecoration: hovered === l.id ? "underline" : "none",
            }}>{l.is_default ? "☆ " : ""}{l.name}</div>
            <div style={{ flex: 1, background: T.surface2, borderRadius: 3, height: 14 }}>
              <div style={{
                width: `${(l.item_count / max) * 100}%`, height: "100%",
                background: T.accent, borderRadius: 3,
                transition: "width 0.2s",
              }} />
            </div>
            <div style={{
              width: 26, flexShrink: 0, fontSize: 11, color: T.dim,
              fontFamily: T.fontMono, textAlign: "right",
              fontVariantNumeric: "tabular-nums",
            }}>{l.item_count}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Rating histogram (−10..+10) for consumed & rated items of one type — gives
// the Rated filter a chart of its own, same as Watchlist/In Progress/
// Completed get from the status donut. Maps an exact display value to the
// nearest "X & up" bucket the Personal Rating TopBar filter understands.
const personalRatingBucket = (d) => {
  if (d >= 8) return "+8 & up";
  if (d >= 5) return "+5 & up";
  if (d >= 1) return "+1 & up";
  if (d >= 0) return "0 & up";
  return "Below 0";
};

function RatingDistributionCard({ items, title, color, onNavigate }) {
  const [hovered, setHovered] = useState(null);

  const buckets = useMemo(() => {
    const counts = new Map();
    for (let d = -10; d <= 10; d++) counts.set(d, 0);
    items.forEach(i => {
      if (i.rating == null) return;
      const d = ratingToDisplay(i.rating);
      counts.set(d, (counts.get(d) || 0) + 1);
    });
    return [...counts.entries()].map(([display, count]) => ({ display, count }));
  }, [items]);

  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  const max = Math.max(...buckets.map(b => b.count));
  const go = () => onNavigate(title, { ratedFilter: "rated" });

  return (
    <div
      onClick={go}
      style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: 10, padding: "20px 24px", flex: 1, minWidth: 0,
        height: "100%", boxSizing: "border-box", cursor: "pointer",
      }}
    >
      <div style={{
        fontFamily: T.fontMono, fontSize: 9,
        color: T.muted, letterSpacing: "0.1em", textTransform: "uppercase",
        marginBottom: 14,
      }}>Rating Distribution</div>

      <div style={{ position: "relative", display: "flex", alignItems: "flex-end", gap: 2, height: 90 }}>
        {total === 0 && (
          <div style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            fontFamily: T.fontMono, fontSize: 10, color: T.dim,
          }}>No ratings yet</div>
        )}
        {buckets.map(b => (
          <div
            key={b.display}
            onMouseEnter={() => setHovered(b.display)}
            onMouseLeave={() => setHovered(null)}
            onClick={(e) => {
              if (!b.count) return;
              e.stopPropagation();
              // Preselect a sort matching the bucket's direction: "+1 & up"
              // (value ≥ 0) counts up; "Below 0" counts down toward -10.
              onNavigate(title, {
                ratedFilter: "rated",
                personalRating: personalRatingBucket(b.display),
                sort: b.display >= 0 ? "Rating ↑" : "Rating ↓",
              });
            }}
            title={`${b.display > 0 ? "+" : ""}${b.display}: ${b.count}`}
            style={{
              flex: 1, height: "100%", display: "flex",
              alignItems: "flex-end", cursor: "pointer",
            }}
          >
            <div style={{
              width: "100%",
              height: b.count ? `${(b.count / max) * 100}%` : 2,
              background: b.count ? color : T.surface2,
              opacity: hovered === null || hovered === b.display ? 1 : 0.4,
              filter: hovered === b.display ? "brightness(1.15)" : "none",
              borderRadius: 2, transition: "opacity 0.15s, filter 0.15s",
            }} />
          </div>
        ))}
      </div>
      <div style={{
        display: "flex", justifyContent: "space-between", marginTop: 6,
        fontFamily: T.fontMono, fontSize: 9, color: T.muted,
      }}>
        <span>−10</span>
        <span>0</span>
        <span>+10</span>
      </div>
    </div>
  );
}

// Top games by hours played, plus the total across every game with playtime
// data (not just the top 8 shown). runtime is repurposed as hours-played
// for Games (minutes elsewhere) and only ever populated by Steam sync;
// GOG/Epic don't expose playtime. Clicking a row opens that item's own
// Profile page, not a library-filtered view — there's no "playtime" filter.
function MostPlayedCard({ items, onViewItem }) {
  const played = items.filter(i => i.media_type === "Game" && i.runtime > 0);
  if (!played.length) return null;
  const ranked = [...played].sort((a, b) => b.runtime - a.runtime).slice(0, 8);
  const max = ranked[0].runtime;
  const totalHours = played.reduce((sum, i) => sum + i.runtime, 0);
  const color = getTypeConfig("Game").color;

  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 10, padding: "20px 24px", height: "100%", boxSizing: "border-box",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <span style={{
          fontFamily: T.fontMono, fontSize: 9, color: T.muted,
          letterSpacing: "0.1em", textTransform: "uppercase",
        }}>Most Played</span>
        <span style={{ fontFamily: T.fontMono, fontSize: 10, color: T.dim }}>
          {totalHours.toLocaleString()}h total
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {ranked.map((item, i) => (
          <div key={item.id} onClick={() => onViewItem(item)} style={{ cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, gap: 8 }}>
              <span style={{
                fontSize: 12.5, color: T.text, fontFamily: T.fontSerif,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                <span style={{ color: T.muted, fontFamily: T.fontMono, fontSize: 10, marginRight: 8 }}>{i + 1}</span>
                {item.title}
              </span>
              <span style={{ fontSize: 11, color: T.dim, fontFamily: T.fontMono, flexShrink: 0 }}>{item.runtime}h</span>
            </div>
            <div style={{ height: 4, background: T.surface2, borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: `${(item.runtime / max) * 100}%`, height: "100%", background: color, borderRadius: 2 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Maps a rounded 0..10 critic score to the nearest "X+" bucket the Critic
// Rating TopBar filter understands. Bars below the lowest threshold (3)
// fall back to "Any Critic Rating" — no "below" bucket like Personal Rating has.
const criticRatingBucket = (v) => {
  if (v >= 8) return "8+";
  if (v >= 6) return "6+";
  if (v >= 5) return "5+";
  if (v >= 3) return "3+";
  return "Any Critic Rating";
};

// Same histogram pattern as RatingDistributionCard, but on each item's own
// external/critic rating (externalRatingValue, normalized to a 0–10 scale
// per type) instead of the personal −10..+10 scale — rounded to the
// nearest integer since critic scores are often fractional.
function CriticRatingDistributionCard({ items, title, color, onNavigate }) {
  const [hovered, setHovered] = useState(null);

  const buckets = useMemo(() => {
    const counts = new Map();
    for (let v = 0; v <= 10; v++) counts.set(v, 0);
    items.forEach(i => {
      const raw = externalRatingValue(i);
      if (raw == null) return;
      const v = Math.min(10, Math.max(0, Math.round(raw)));
      counts.set(v, (counts.get(v) || 0) + 1);
    });
    return [...counts.entries()].map(([value, count]) => ({ value, count }));
  }, [items]);

  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  const max = Math.max(...buckets.map(b => b.count));
  const go = () => onNavigate(title, {});

  return (
    <div
      onClick={go}
      style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: 10, padding: "20px 24px", flex: 1, minWidth: 0,
        height: "100%", boxSizing: "border-box", cursor: "pointer",
      }}
    >
      <div style={{
        fontFamily: T.fontMono, fontSize: 9,
        color: T.muted, letterSpacing: "0.1em", textTransform: "uppercase",
        marginBottom: 14,
      }}>Critic Rating Distribution</div>

      <div style={{ position: "relative", display: "flex", alignItems: "flex-end", gap: 2, height: 90 }}>
        {total === 0 && (
          <div style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            fontFamily: T.fontMono, fontSize: 10, color: T.dim,
          }}>No critic ratings yet</div>
        )}
        {buckets.map(b => (
          <div
            key={b.value}
            onMouseEnter={() => setHovered(b.value)}
            onMouseLeave={() => setHovered(null)}
            onClick={(e) => {
              if (!b.count) return;
              e.stopPropagation();
              onNavigate(title, { criticRating: criticRatingBucket(b.value) });
            }}
            title={`${b.value}/10: ${b.count}`}
            style={{
              flex: 1, height: "100%", display: "flex",
              alignItems: "flex-end", cursor: "pointer",
            }}
          >
            <div style={{
              width: "100%",
              height: b.count ? `${(b.count / max) * 100}%` : 2,
              background: b.count ? color : T.surface2,
              opacity: hovered === null || hovered === b.value ? 1 : 0.4,
              filter: hovered === b.value ? "brightness(1.15)" : "none",
              borderRadius: 2, transition: "opacity 0.15s, filter 0.15s",
            }} />
          </div>
        ))}
      </div>
      <div style={{
        display: "flex", justifyContent: "space-between", marginTop: 6,
        fontFamily: T.fontMono, fontSize: 9, color: T.muted,
      }}>
        <span>0</span>
        <span>5</span>
        <span>10</span>
      </div>
    </div>
  );
}

// Row counts for one "effective type" id — a plain media_type string for a
// built-in or "custom:<id>" for a custom type, so this works uniformly.
function statusRowForId(items, id) {
  const typeItems = id == null ? items : items.filter(i => effectiveType(i) === id);
  const consumed  = typeItems.filter(i => i.status === "consumed");
  const dropped   = typeItems.filter(i => i.status === "dropped");
  const rated     = [...consumed, ...dropped].filter(i => i.rating);
  const avgRating = rated.length
    ? (rated.reduce((sum, i) => sum + ratingToDisplay(i.rating), 0) / rated.length).toFixed(1)
    : null;
  return {
    total:      typeItems.length,
    consumed:   consumed.length,
    inProgress: typeItems.filter(i => i.status === "in-progress").length,
    wishlist:   typeItems.filter(i => i.status === "wishlist").length,
    notStarted: typeItems.filter(i => i.status === "not-started").length,
    dropped:    dropped.length,
    owned:      typeItems.filter(isOwned).length,
    avgRating,
  };
}

// Status donut for one type at a time, with a picker to switch which type,
// so every type gets the same chart. Selection is owned by the parent
// StatsView so the Rating/Critic Rating cards next to it follow the same type.
function StatusBreakdownPicker({ items, options, activeOption, onSelect, onNavigate }) {
  if (!activeOption) return null;
  const row = statusRowForId(items, activeOption.id);

  const picker = (
    <select
      value={activeOption.id ?? "__all__"}
      onChange={e => onSelect(e.target.value === "__all__" ? null : e.target.value)}
      style={{
        padding: "5px 10px", background: T.surface2, border: `1px solid ${T.border}`,
        borderRadius: 5, color: T.text, fontSize: 11, fontFamily: T.fontMono,
        outline: "none", cursor: "pointer",
      }}
    >
      {options.map(o => <option key={o.id ?? "__all__"} value={o.id ?? "__all__"}>{o.label}</option>)}
    </select>
  );

  return (
    <div style={{ flexShrink: 0 }}>
      <StatusBreakdownCard
        type={activeOption.id}
        row={row}
        onNavigate={onNavigate}
        label={activeOption.label}
        picker={picker}
      />
    </div>
  );
}

export default function StatsView({ items, lists = [], onNavigate, onViewItem, customTypes = [] }) {
  // Options for the status-breakdown type picker, shared with the Rating and
  // Critic Rating cards so all three switch together. "All" (id: null) is
  // first, then every type the library has items for. withCustomTypeTabs
  // gives built-ins AND custom types in one list, single-type entries only.
  const statusOptions = useMemo(() => {
    const typeOptions = withCustomTypeTabs(customTypes)
      .filter(t => t.includes?.length === 1)
      .map(t => ({ id: t.includes[0], label: t.label, color: t.color }))
      .filter(o => items.some(i => effectiveType(i) === o.id));
    return [{ id: null, label: "All", color: T.accent }, ...typeOptions];
  }, [items, customTypes]);

  // Defaults to "All" — statusOptions[0] is always that entry, present even
  // for an empty library.
  const [selectedType, setSelectedType] = useState(null);
  const activeStatusOption = statusOptions.find(o => o.id === selectedType) ?? statusOptions[0];

  const ratingItems = activeStatusOption.id == null
    ? items
    : items.filter(i => effectiveType(i) === activeStatusOption.id);

  const total = items.length;

  const byType = useMemo(() => TYPES.map(type => {
    const typeItems = items.filter(i => i.media_type === type);
    const consumed  = typeItems.filter(i => i.status === "consumed");
    const dropped   = typeItems.filter(i => i.status === "dropped");
    // Both ratable statuses count toward average rating — an opinion on
    // something you dropped is still a rating signal.
    const rated     = [...consumed, ...dropped].filter(i => i.rating);
    const avgRating = rated.length
      ? (rated.reduce((sum, i) => sum + ratingToDisplay(i.rating), 0) / rated.length).toFixed(1)
      : null;
    return {
      type,
      total:      typeItems.length,
      consumed:   consumed.length,
      inProgress: typeItems.filter(i => i.status === "in-progress").length,
      wishlist:   typeItems.filter(i => i.status === "wishlist").length,
      notStarted: typeItems.filter(i => i.status === "not-started").length,
      dropped:    dropped.length,
      owned:      typeItems.filter(isOwned).length,
      avgRating,
    };
  }).filter(r => r.total > 0), [items]);

  if (total === 0) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 13, color: T.muted, fontFamily: T.fontMono }}>No items in library</div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px 24px 40px" }}>

      {/* ── Status breakdown (pick which type) + Rating + Critic Rating,
             side by side — the donut card shrinks to its own content width,
             the two rating histograms split the remaining space. All three
             follow the same type picker: same color, same filtered items,
             switching together whenever the dropdown changes. ── */}
      <div style={{ display: "flex", gap: 12, alignItems: "stretch", marginBottom: 24 }}>
        <StatusBreakdownPicker
          items={items}
          options={statusOptions}
          activeOption={activeStatusOption}
          onSelect={setSelectedType}
          onNavigate={onNavigate}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <RatingDistributionCard items={ratingItems} title={activeStatusOption.label} color={activeStatusOption.color} onNavigate={onNavigate} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <CriticRatingDistributionCard items={ratingItems} title={activeStatusOption.label} color={activeStatusOption.color} onNavigate={onNavigate} />
        </div>
      </div>

      {/* Most Played — full width, the "All" state of the status-breakdown
          donut above already covers the type-breakdown ground. */}
      {items.some(i => i.media_type === "Game" && i.runtime > 0) && (
        <div style={{ marginBottom: 24 }}>
          <MostPlayedCard items={items} onViewItem={onViewItem} />
        </div>
      )}

      <ListBarChart lists={lists} onNavigate={onNavigate} />

      {/* ── Genre breakdown across every type that has one, each bar
             stacked by type instead of one chart per type. */}
      <AllGenresBarChart items={items} onNavigate={onNavigate} />

    </div>
  );
}
