import { useMemo } from "react";
import { T, getEffectiveTypeConfig, formatRating, TYPE_TABS } from "../tokens.js";

// Genre is stored as a comma list — first tag only, keeps the row compact
// rather than repeating the full tag set.
const splitGenres = (genreStr) => (genreStr || "").split(",").map(g => g.trim()).filter(Boolean);

// TYPE_TABS carries the plural display label (e.g. "Movies"); MEDIA_TYPES'
// own .label is the internal media_type value itself (singular, e.g.
// "Movie") — this map lets a row show the plural form without hardcoding
// a second copy of every type name.
const TYPE_DISPLAY = Object.fromEntries(
  TYPE_TABS.filter(t => t.includes?.length === 1).map(t => [t.includes[0], t.label])
);

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const GRID_COLUMNS = "30px 34px 1.6fr 1fr 1fr 1fr 1fr 1fr 1fr";

// Chronological list of every completed item, grouped by year then month,
// newest first — its own tab rather than living inside Stats, since it's a
// genuinely different kind of view (a browsable history, not a chart).
export default function HistoryView({ items, customTypes = [], onEdit }) {
  // Full completed history, newest first. Items with no date_consumed sort
  // last among themselves by id.
  const chronologicalCompleted = useMemo(() => [...items]
    .filter(i => i.status === "consumed")
    .sort((a, b) => {
      if (a.date_consumed && b.date_consumed)
        return b.date_consumed.localeCompare(a.date_consumed);
      if (a.date_consumed) return -1;
      if (b.date_consumed) return 1;
      return b.id - a.id;
    }), [items]);

  // Year -> Month label -> items, both already in descending order since
  // the source list is — Map preserves insertion order, no re-sort needed.
  // Undated items land in one trailing "Undated" group.
  const groupedCompleted = useMemo(() => {
    const years = new Map();
    for (const item of chronologicalCompleted) {
      let yearKey, monthLabel;
      if (item.date_consumed) {
        const [y, m] = item.date_consumed.split("-");
        yearKey = y;
        monthLabel = MONTH_NAMES[parseInt(m, 10) - 1] ?? m;
      } else {
        yearKey = "Undated";
        monthLabel = "Undated";
      }
      if (!years.has(yearKey)) years.set(yearKey, new Map());
      const months = years.get(yearKey);
      if (!months.has(monthLabel)) months.set(monthLabel, []);
      months.get(monthLabel).push(item);
    }
    return years;
  }, [chronologicalCompleted]);

  if (chronologicalCompleted.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 13, color: T.muted, fontFamily: T.fontMono }}>Nothing consumed yet</div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px 24px 40px" }}>
      {[...groupedCompleted.entries()].map(([year, months]) => (
        <div key={year} style={{ marginBottom: 18 }}>
          <div style={{
            fontFamily: T.fontSerif, fontSize: 18, color: T.text,
            marginBottom: 8,
          }}>{year}</div>

          {[...months.entries()].map(([month, monthItems]) => (
            <div key={month} style={{ marginBottom: 10 }}>
              <div style={{
                fontSize: 10, color: T.accent, fontFamily: T.fontMono,
                letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6,
              }}>{month}</div>

              <div style={{
                background: T.surface, border: `1px solid ${T.border}`,
                borderRadius: 8, overflow: "hidden",
              }}>
                {/* Header — same grid as the rows below, so columns line up. */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: GRID_COLUMNS,
                  gap: 12, padding: "6px 16px",
                  borderBottom: `1px solid ${T.border}`,
                  fontSize: 8, color: T.muted, fontFamily: T.fontMono,
                  letterSpacing: "0.08em", textTransform: "uppercase",
                }}>
                  <span /><span />
                  <span>Title</span>
                  <span>Genre</span>
                  <span>Creator</span>
                  <span>Year</span>
                  <span>Played</span>
                  <span>Type</span>
                  <span>Rating</span>
                </div>

                {monthItems.map((item, i) => {
                  const cfg = getEffectiveTypeConfig(item, customTypes);
                  const day = item.date_consumed ? item.date_consumed.slice(8, 10) : null;
                  return (
                    <div
                      key={item.id}
                      onClick={() => onEdit(item)}
                      style={{
                        display: "grid",
                        gridTemplateColumns: GRID_COLUMNS,
                        gap: 12, alignItems: "center",
                        padding: "8px 16px", cursor: "pointer",
                        borderBottom: i < monthItems.length - 1 ? `1px solid ${T.border}` : "none",
                        background: i % 2 === 0 ? "transparent" : T.surface2,
                      }}
                    >
                      <div style={{
                        fontFamily: T.fontMono, fontSize: 11,
                        color: T.dim, textAlign: "center", fontVariantNumeric: "tabular-nums",
                      }}>{day ?? "—"}</div>

                      <div style={{
                        width: 34, height: 34, borderRadius: 4, overflow: "hidden",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: item.cover_art_path ? "transparent" : cfg.gradient,
                      }}>
                        {item.cover_art_path ? (
                          <img
                            src={`file://${item.cover_art_path}`}
                            alt={item.title}
                            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                          />
                        ) : (
                          <span style={{ fontSize: 14, opacity: 0.3 }}>{cfg.icon}</span>
                        )}
                      </div>

                      <div style={{
                        minWidth: 0, fontSize: 13, color: T.text,
                        fontFamily: T.fontSerif,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>{item.title}</div>

                      <div style={{
                        minWidth: 0, fontSize: 11, color: T.muted,
                        fontFamily: T.fontMono, overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>{splitGenres(item.genre)[0] || ""}</div>

                      <div style={{
                        minWidth: 0, fontSize: 11, color: T.muted,
                        fontFamily: T.fontMono, overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>{item.creator || ""}</div>

                      <div style={{
                        fontSize: 11, color: T.dim,
                        fontFamily: T.fontMono, fontVariantNumeric: "tabular-nums",
                      }}>{item.year || ""}</div>

                      {/* Games only — runtime is repurposed as hours-played
                          for this type (see tokens.js's TYPE_FIELDS). */}
                      <div style={{
                        fontSize: 11, color: T.muted, fontFamily: T.fontMono,
                      }}>{item.media_type === "Game" && item.runtime ? `${item.runtime}h played` : ""}</div>

                      <div style={{
                        fontSize: 10, color: T.muted, fontFamily: T.fontMono,
                      }}>{TYPE_DISPLAY[item.media_type] ?? cfg.label}</div>

                      <div style={{
                        fontSize: 11, color: T.accent, fontFamily: T.fontMono,
                      }}>{item.rating ? `★ ${formatRating(item.rating)}` : ""}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
