import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { T, TYPE_TABS, SORT_OPTIONS, PERSONAL_RATING_BUCKETS, CRITIC_RATING_BUCKETS, typeTabKey, orderTypeTabs } from "../tokens.js";

const useHover = () => {
  const [h, setH] = useState(false);
  return [h, { onMouseEnter: () => setH(true), onMouseLeave: () => setH(false) }];
};

const StatFilterPill = ({ count, label, active, activeColor, hoverColor, onClick, caret = false }) => {
  const [h, hProps] = useHover();
  const col = activeColor;
  return (
    <button onClick={onClick} {...hProps} style={{
      display: "flex", alignItems: "center", gap: 4,
      padding: "3px 10px",
      border: `1px solid ${active ? col : h ? (hoverColor || T.dim) : T.border}`,
      borderRadius: 100, cursor: "pointer",
      background: active ? col : h ? T.hoverWash : "transparent",
      fontFamily: T.fontMono,
      letterSpacing: "0.03em", transition: "all 0.12s", flexShrink: 0,
    }}>
      <span style={{ fontWeight: 700, fontSize: 12, lineHeight: 1, color: active ? T.bg : col, minWidth: "4ch", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{count}</span>
      <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: active ? T.bg : h ? T.dim : T.muted }}>{label}</span>
      {caret && <span style={{ fontSize: 8, marginLeft: 2, color: active ? T.bg : T.muted }}>▼</span>}
    </button>
  );
};

const TabBtn = ({ tab, active, onClick, caret = false }) => {
  const [h, hProps] = useHover();
  const color = tab.color || T.accent;
  return (
    <button onClick={onClick} {...hProps} style={{
      display: "flex", alignItems: "center", gap: 4,
      padding: "4px 10px", border: "none", cursor: "pointer",
      background: active ? color + "22" : h ? T.hoverWash : "transparent",
      color: active ? color : h ? T.dim : T.muted,
      fontSize: 11, fontWeight: active ? 600 : 400, borderRadius: 4,
      borderBottom: active ? `2px solid ${color}` : "2px solid transparent",
      fontFamily: T.fontSans, transition: "all 0.12s",
    }}>
      {tab.icon && <span style={{ fontSize: 11 }}>{tab.icon}</span>}
      {tab.label}
      {caret && <span style={{ fontSize: 8, marginLeft: 2 }}>▼</span>}
    </button>
  );
};

// Overflow menu for the fixed group of original built-in types (see
// MORE_MENU_TYPES) — keeps the main tab row from getting crowded as new
// types get added. Only ever shows tabs that aren't individually hidden.
const MoreTypesMenu = ({ tabs, active, onSelect }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);

  // Anchored with position:fixed off the button's own measured rect, so the
  // panel lands right under the button wherever the top bar's wrapping put
  // it, and can never be clipped by the bar's bounds.
  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen(o => !o);
  };

  if (tabs.length === 0) return null;
  return (
    <div style={{ position: "relative" }}>
      <button
        ref={btnRef}
        onClick={toggle}
        style={{
          display: "flex", alignItems: "center", gap: 3,
          padding: "4px 8px", border: "none", cursor: "pointer",
          background: active ? T.accent + "22" : "transparent",
          color: active ? T.accent : T.muted,
          fontSize: 11, borderRadius: 4,
          fontFamily: T.fontSans,
        }}
      >··· More</button>
      {open && pos && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 59 }} />
          <div style={{
            position: "fixed", top: pos.top, left: pos.left,
            background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6,
            padding: 4, minWidth: 150, zIndex: 60,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}>
            {tabs.map(tab => (
              <button
                key={tab.label}
                onClick={() => { onSelect(tab.label); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 6, width: "100%",
                  textAlign: "left", padding: "6px 8px", background: "none",
                  border: "none", borderRadius: 4, cursor: "pointer",
                  color: T.text, fontSize: 12, fontFamily: T.fontSans,
                }}
              >
                {tab.icon && <span style={{ fontSize: 12 }}>{tab.icon}</span>}
                {tab.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// The "+" button — show/hide checklist for every non-"All" type (built-in
// and custom), drag-to-reorder (order decides the first-7-inline / rest-
// under-"...More" split), custom-type deletion, and the custom-type
// creation action.
const ManageTypesMenu = ({ typeTabs, hiddenTypeKeys, onToggleTypeHidden, onDeleteCustomType, onOpenCustomTypeBuilder, onReorderTypes }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [deleteConfirmKey, setDeleteConfirmKey] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [dragKey, setDragKey] = useState(null);
  const btnRef = useRef(null);

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen(o => !o);
  };

  const handleDelete = async (tab) => {
    const res = await onDeleteCustomType(tab.customTypeId);
    if (res.success) {
      setDeleteConfirmKey(null);
      setDeleteError("");
    } else {
      setDeleteError(res.error);
    }
  };

  const handleDrop = (targetKey) => {
    if (!dragKey || dragKey === targetKey) { setDragKey(null); return; }
    const keys = typeTabs.map(typeTabKey);
    const from = keys.indexOf(dragKey);
    const to = keys.indexOf(targetKey);
    setDragKey(null);
    if (from === -1 || to === -1) return;
    const next = [...keys];
    next.splice(from, 1);
    next.splice(to, 0, dragKey);
    onReorderTypes(next);
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={btnRef}
        onClick={toggle}
        title="Show/hide and reorder media types, manage custom types"
        style={{
          width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center",
          border: `1px solid ${T.border}`, borderRadius: 4, cursor: "pointer",
          background: "transparent", color: T.muted, fontSize: 13, marginLeft: 4,
          fontFamily: T.fontSans,
        }}
      >+</button>
      {open && pos && (
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 59 }} />
      )}
      {open && pos && (
        <div onClick={e => e.stopPropagation()} style={{
          position: "fixed", top: pos.top, left: pos.left,
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6,
          padding: 6, minWidth: 210, maxHeight: 340, overflowY: "auto", zIndex: 60,
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          display: "flex", flexDirection: "column", gap: 1,
        }}>
          <button
            onClick={() => { setOpen(false); onOpenCustomTypeBuilder(); }}
            style={{
              width: "100%", textAlign: "left", padding: "6px 8px",
              background: "none", border: `1px dashed ${T.border}`, borderRadius: 4,
              color: T.accent, fontSize: 11, cursor: "pointer",
              fontFamily: T.fontSans, marginBottom: 4,
            }}
          >+ Custom Type</button>
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 4, display: "flex", flexDirection: "column", gap: 1 }}>
            {typeTabs.map(tab => {
              const key = typeTabKey(tab);
              const hidden = hiddenTypeKeys.includes(key);
              if (deleteConfirmKey === key) {
                return (
                  <div key={key} style={{ padding: "6px 8px" }}>
                    <div style={{ fontSize: 11, color: T.text, marginBottom: 6, lineHeight: 1.4 }}>
                      Delete "{tab.label}"?
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => handleDelete(tab)}
                        style={{ flex: 1, padding: "4px 0", border: "1px solid #e84b6e", color: "#e84b6e", background: "none", borderRadius: 4, fontSize: 10, cursor: "pointer" }}
                      >Delete</button>
                      <button
                        onClick={() => { setDeleteConfirmKey(null); setDeleteError(""); }}
                        style={{ flex: 1, padding: "4px 0", border: `1px solid ${T.border}`, color: T.text, background: "none", borderRadius: 4, fontSize: 10, cursor: "pointer" }}
                      >Cancel</button>
                    </div>
                    {deleteError && <div style={{ fontSize: 9, color: "#e84b6e", marginTop: 4, lineHeight: 1.4 }}>{deleteError}</div>}
                  </div>
                );
              }
              return (
                <div
                  key={key}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => handleDrop(key)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 4,
                    opacity: dragKey === key ? 0.4 : 1,
                    background: dragKey && dragKey !== key ? T.hoverWash : "transparent",
                  }}
                >
                  <span
                    draggable
                    onDragStart={() => setDragKey(key)}
                    onDragEnd={() => setDragKey(null)}
                    title="Drag to reorder"
                    style={{ cursor: "grab", color: T.muted, fontSize: 11, flexShrink: 0 }}
                  >≡</span>
                  <input
                    type="checkbox"
                    checked={!hidden}
                    onChange={() => onToggleTypeHidden(key)}
                    style={{ cursor: "pointer", flexShrink: 0 }}
                  />
                  {tab.icon && <span style={{ fontSize: 12, flexShrink: 0 }}>{tab.icon}</span>}
                  <span style={{ flex: 1, fontSize: 12, color: T.text, fontFamily: T.fontSans, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tab.label}</span>
                  {tab.isCustom && (
                    <span
                      onClick={() => { setDeleteConfirmKey(key); setDeleteError(""); }}
                      title={`Delete ${tab.label}`}
                      style={{ cursor: "pointer", color: "#e84b6e", fontSize: 13, fontWeight: 700, padding: "0 2px", flexShrink: 0 }}
                    >✕</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const PillBtn = ({ active, activeColor, hoverColor, onClick, children }) => {
  const [h, hProps] = useHover();
  const col = activeColor || T.accent;
  return (
    <button onClick={onClick} {...hProps} style={{
      padding: "3px 10px",
      border: `1px solid ${active ? col : h ? (hoverColor || T.dim) : T.border}`,
      borderRadius: 100, cursor: "pointer",
      background: active ? col : h ? T.hoverWash : "transparent",
      color: active ? T.bg : h ? T.dim : T.muted,
      fontSize: 10, fontWeight: active ? 700 : 400,
      fontFamily: T.fontMono, letterSpacing: "0.03em",
      transition: "all 0.12s", flexShrink: 0,
    }}>{children}</button>
  );
};

const IconBtn = ({ active, activeColor, onClick, children, title }) => {
  const [h, hProps] = useHover();
  const col = activeColor || T.accent;
  return (
    <button onClick={onClick} title={title} {...hProps} style={{
      width: 26, height: 26,
      border: `1px solid ${active ? col : h ? T.dim : T.border}`,
      borderRadius: 4, cursor: "pointer",
      background: active ? col + "22" : h ? T.hoverWash : "transparent",
      color: active ? col : h ? T.dim : T.muted,
      fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0, transition: "all 0.12s",
    }}>{children}</button>
  );
};

const PrimaryBtn = ({ onClick, children }) => {
  const [h, hProps] = useHover();
  return (
    <button onClick={onClick} {...hProps} style={{
      padding: "4px 14px",
      background: T.accent, filter: h ? "brightness(0.88)" : "none",
      color: T.bg, border: "none", borderRadius: 5,
      fontSize: 11, fontWeight: 700, cursor: "pointer",
      fontFamily: T.fontSans, flexShrink: 0,
      transition: "filter 0.12s",
    }}>{children}</button>
  );
};

// Clicking it is a "home" shortcut — back to the default tile view of the
// whole library, same as a fresh launch: out of any item profile/stats/
// discover/history view, every filter cleared, tile display restored.
const Wordmark = ({ onClick }) => (
  <div
    onClick={onClick}
    style={{
      fontFamily: T.fontSerif, fontSize: 16,
      color: T.accent, letterSpacing: "-0.02em",
      cursor: "pointer",
    }}
  >
    The Media Vault
  </div>
);

// Compact-mode dropdowns. When the window is too small for the full pill row
// and tab row to fit on one line, each collapses to a single button showing
// the current choice; clicking it lists every option. The closed button and
// the rows reuse the pill / tab styling, so the colours are unchanged.
// Anchored position:fixed off the button's measured rect, like the other
// top-bar menus, so it's never clipped and follows wherever the bar wraps.
const useAnchoredPanel = () => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen(o => !o);
  };
  return { open, setOpen, pos, btnRef, toggle };
};

const PanelShell = ({ pos, onClose, children }) => (
  <>
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 59 }} />
    <div style={{
      position: "fixed", top: pos.top, left: pos.left,
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6,
      padding: 4, minWidth: 150, maxHeight: "70vh", overflowY: "auto", zIndex: 60,
      boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      display: "flex", flexDirection: "column", alignItems: "stretch", gap: 3,
    }}>{children}</div>
  </>
);

const StatusDropdown = ({ options, value, onChange }) => {
  const { open, setOpen, pos, btnRef, toggle } = useAnchoredPanel();
  const current = options.find(o => o.value === value) || options[0];
  return (
    <div ref={btnRef} style={{ position: "relative" }}>
      <StatFilterPill
        count={current.count} label={current.label}
        active activeColor={current.color} onClick={toggle} caret
      />
      {open && pos && (
        <PanelShell pos={pos} onClose={() => setOpen(false)}>
          {options.map(o => (
            <StatFilterPill
              key={o.value}
              count={o.count} label={o.label}
              active={o.value === value}
              activeColor={o.color} hoverColor={o.hover}
              onClick={() => { onChange(o.value); setOpen(false); }}
            />
          ))}
        </PanelShell>
      )}
    </div>
  );
};

const TypeDropdown = ({ tabs, activeTab, onSelect }) => {
  const { open, setOpen, pos, btnRef, toggle } = useAnchoredPanel();
  const current = tabs.find(t => t.label === activeTab) || tabs[0];
  if (!current) return null;
  return (
    <div ref={btnRef} style={{ position: "relative" }}>
      <TabBtn tab={current} active onClick={toggle} caret />
      {open && pos && (
        <PanelShell pos={pos} onClose={() => setOpen(false)}>
          {tabs.map(t => (
            <TabBtn
              key={t.label} tab={t}
              active={t.label === activeTab}
              onClick={() => { onSelect(t.label); setOpen(false); }}
            />
          ))}
        </PanelShell>
      )}
    </div>
  );
};

const selectStyle = {
  height: 26, padding: "0 8px", background: T.surface,
  border: `1px solid ${T.border}`, borderRadius: 5,
  color: T.muted, fontSize: 10, cursor: "pointer", flexShrink: 0,
  fontFamily: T.fontMono,
};

// The search box's natural width (160 content + padding + border) and the
// smallest it may shrink to when the top row runs short of room.
const SEARCH_PX = 198;
const MIN_SEARCH_PX = 72;

// Sort as just an arrow, for a narrow top bar. A native <select> can't be
// reduced to only its arrow without hiding the arrow too, so this is a small
// button opening the same option list.
const SortArrowDropdown = ({ options, value, onChange }) => {
  const { open, setOpen, pos, btnRef, toggle } = useAnchoredPanel();
  return (
    <div ref={btnRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={toggle}
        title={`Sort: ${value}`}
        style={{ ...selectStyle, width: 26, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8 }}
      >▼</button>
      {open && pos && (
        <PanelShell pos={pos} onClose={() => setOpen(false)}>
          {options.map(o => (
            <button
              key={o}
              onClick={() => { onChange(o); setOpen(false); }}
              style={{
                textAlign: "left", padding: "6px 10px", border: "none", borderRadius: 4, cursor: "pointer",
                background: o === value ? T.accent + "22" : "none",
                color: o === value ? T.accent : T.text, fontSize: 11, fontFamily: T.fontSans,
              }}
            >{o}</button>
          ))}
        </PanelShell>
      )}
    </div>
  );
};

const FilterField = ({ label, children }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
    <span style={{
      fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em",
      color: T.muted, fontFamily: T.fontMono, flexShrink: 0,
    }}>{label}</span>
    {children}
  </div>
);

// Three-way segmented row (All/X/not-X) shared by both Rated and Owned in
// the Filter popover below, generalized to any 3 options.
const TriStateRow = ({ value, onChange, options, color }) => (
  <div style={{ display: "flex", gap: 4 }}>
    {options.map(([val, label]) => (
      <button
        key={val}
        onClick={() => onChange(val)}
        style={{
          flex: 1, padding: "5px 0",
          background: value === val ? color + "22" : T.surface2,
          border: `1px solid ${value === val ? color : T.border}`,
          borderRadius: 4, color: value === val ? color : T.muted,
          fontSize: 10, cursor: "pointer", fontFamily: T.fontMono,
          transition: "all 0.12s",
        }}
      >{label}</button>
    ))}
  </div>
);

const RATED_OPTIONS = [["all", "All"], ["rated", "Rated"], ["not-rated", "Not Rated"]];
const OWNED_OPTIONS = [["all", "All"], ["owned", "Owned"], ["not-owned", "Not Owned"]];
// "visible" is the default — hidden items are excluded, distinct from "all"
// (no filtering by hidden status). Order matters: the default reads first.
const WEB_KIND_OPTIONS = [["all", "All"], ["channel", "Channels"], ["video", "Videos"], ["playlist", "Playlists"]];
const HIDDEN_OPTIONS = [["visible", "Not Hidden"], ["hidden", "Hidden Only"], ["all", "All"]];

const popoverSelectStyle = { ...selectStyle, width: "100%", boxSizing: "border-box" };

// The List filter as a dropdown whose open menu carries a ✕ per deletable
// list, mirroring the Add-to-List popover. A native <select> can't hold
// buttons, hence the custom one. The default list never gets a ✕.
const ListFilterDropdown = ({ lists, value, onChange, onDelete }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const options = [{ id: "", name: "All Lists" }, ...lists];
  const current = options.find(o => o.id === value) || options[0];
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ ...popoverSelectStyle, display: "flex", alignItems: "center", justifyContent: "space-between", textAlign: "left" }}
      >
        <span>{current.is_default ? "☆ " : ""}{current.name}</span>
        <span style={{ fontSize: 8, marginLeft: 6 }}>▼</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 5,
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6,
          padding: 4, boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          display: "flex", flexDirection: "column", gap: 2,
        }}>
          {options.map(o => (
            <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <button
                onClick={() => { onChange(o.id); setOpen(false); }}
                style={{
                  flex: 1, textAlign: "left", padding: "5px 8px",
                  background: o.id === value ? T.accent + "22" : "none", border: "none",
                  color: o.id === value ? T.accent : T.text, fontSize: 11, cursor: "pointer",
                  borderRadius: 4, fontFamily: T.fontSans,
                }}
              >{o.is_default ? "☆ " : ""}{o.name}</button>
              {o.id !== "" && !o.is_default && (
                <button
                  onClick={() => { if (confirm(`Delete the list "${o.name}"? Items stay in your library.`)) { setOpen(false); onDelete(o.id); } }}
                  title={`Delete "${o.name}"`}
                  style={{
                    flexShrink: 0, width: 20, height: 20, background: "none",
                    border: "none", color: T.muted, fontSize: 12, cursor: "pointer",
                    borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >✕</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const PopoverSection = ({ label, children }) => (
  <div>
    <div style={{ fontSize: 9, color: T.muted, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</div>
    {children}
  </div>
);

// Every narrowing control (Genre, Age Rating, Lists, Personal/Critic
// Rating, Where to Watch, Rated/Owned) consolidated into one popover so
// Row 2 doesn't stay a wall of dropdowns. closeSpecialViews() is passed in
// rather than duplicated here.
//
// position: fixed off the button's own measured rect, not position:
// absolute inside the row — the row can wrap onto extra lines, so the
// button's position isn't fixed, and a fixed popover placed from its
// measured rect follows wherever it lands (and, from when Row 2 scrolled
// sideways, was never clipped by the row's own bounds). Same approach
// PosterCard's StatusWheel uses.
const FilterButton = ({
  ratedFilter, onRatedFilterChange, ownedFilter, onOwnedFilterChange,
  hiddenFilter, onHiddenFilterChange,
  webKindFilter = "all", onWebKindFilterChange, showWebKind = false,
  genre, onGenreChange, genres,
  ageRating, onAgeRatingChange, ageRatings,
  platformFilter, onPlatformFilterChange, platforms,
  osConsole, onOsConsoleChange, osConsoles,
  lists, listFilter, onListFilterChange, onDeleteList,
  personalRating, onPersonalRatingChange,
  criticRating, onCriticRatingChange,
  watchFilter, onWatchFilterChange, watchProviderOptions, watchRegion, onRefreshWatchSettings,
  onSettings, closeSpecialViews,
  iconOnly = false, // narrow top bar: just the funnel symbol (plus the active-filter count)
}) => {
  const [anchorRect, setAnchorRect] = useState(null);
  const [watchSettingsRefreshed, setWatchSettingsRefreshed] = useState(false);
  const btnRef = useRef(null);

  const activeCount = [
    ratedFilter !== "all",
    ownedFilter !== "all",
    hiddenFilter !== "visible",
    showWebKind && webKindFilter !== "all",
    genre !== "All Genres",
    ageRating !== "All Age Ratings",
    platformFilter !== "All Platforms",
    osConsole !== "All OS & Consoles",
    !!listFilter,
    personalRating !== "Any Rating",
    criticRating !== "Any Critic Rating",
    !!watchFilter,
  ].filter(Boolean).length;
  const active = activeCount > 0;

  const toggle = () => {
    if (anchorRect) { setAnchorRect(null); return; }
    setAnchorRect(btnRef.current.getBoundingClientRect());
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        title={iconOnly ? `Filter${active ? ` (${activeCount})` : ""}` : undefined}
        style={{
          height: 26, padding: iconOnly ? "0 8px" : "0 10px", display: "flex", alignItems: "center", gap: 5,
          border: `1px solid ${active ? T.accent : T.border}`, borderRadius: 5,
          background: active ? T.accent + "22" : T.surface,
          color: active ? T.accent : T.muted,
          fontSize: 10, fontFamily: T.fontMono, cursor: "pointer",
          flexShrink: 0, transition: "all 0.12s",
        }}
      >
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
          <path d="M2 3h12l-4.5 5.5v4l-3 1.5v-5.5L2 3z" fill="currentColor" />
        </svg>
        {iconOnly ? (active ? activeCount : "") : `Filter${active ? ` (${activeCount})` : ""}`}
      </button>
      {anchorRect && (
        <>
          <div onClick={() => setAnchorRect(null)} style={{ position: "fixed", inset: 0, zIndex: 59 }} />
          <div style={{
            position: "fixed", top: anchorRect.bottom + 6, left: anchorRect.left,
            background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6,
            padding: 14, width: 240, maxHeight: "80vh", overflowY: "auto", zIndex: 60,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            display: "flex", flexDirection: "column", gap: 14,
          }}>
            {/* Where to Watch — provider dropdown (or a setup prompt) plus
                the region indicator and refresh action, one group. */}
            <PopoverSection label="Where to Watch">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {watchProviderOptions.length > 0 ? (
                  <select value={watchFilter} onChange={e => { closeSpecialViews(); onWatchFilterChange(e.target.value); }} style={popoverSelectStyle}>
                    <option value="">Where to Watch</option>
                    {watchProviderOptions.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                ) : (
                  <button
                    onClick={() => { closeSpecialViews(); onSettings(); }}
                    title="Choose streaming services to filter by"
                    style={{ ...popoverSelectStyle, borderStyle: "dashed", color: T.dim, textAlign: "left" }}
                  >Set up ⚙</button>
                )}
                <div style={{ display: "flex", gap: 6 }}>
                  {/* Region — opens Settings' API Keys tab to change it.
                      Windows doesn't render flag emoji as actual flags, so
                      styled as a plain text chip. */}
                  <button
                    onClick={() => { closeSpecialViews(); onSettings(); }}
                    title={`Streaming region: ${watchRegion || "not set"} — click to change`}
                    style={{
                      flex: 1, height: 26, display: "flex",
                      alignItems: "center", justifyContent: "center",
                      border: `1px solid ${T.border}`, borderRadius: 4,
                      background: T.accent + "22", color: T.accent,
                      fontSize: 10, fontWeight: 700, fontFamily: T.fontMono,
                      cursor: "pointer", transition: "all 0.12s",
                    }}
                  >{(watchRegion || "??").toUpperCase()}</button>
                  {onRefreshWatchSettings && (
                    <button
                      onClick={() => {
                        closeSpecialViews();
                        onRefreshWatchSettings();
                        setWatchSettingsRefreshed(true);
                        setTimeout(() => setWatchSettingsRefreshed(false), 900);
                      }}
                      title="Refresh streaming region and services from Settings"
                      style={{
                        height: 26, width: 26, flexShrink: 0, display: "flex",
                        alignItems: "center", justifyContent: "center",
                        border: `1px solid ${watchSettingsRefreshed ? T.seen : T.border}`, borderRadius: 4,
                        background: T.surface, color: watchSettingsRefreshed ? T.seen : T.muted,
                        fontSize: 12, cursor: "pointer", transition: "all 0.12s",
                      }}
                    >{watchSettingsRefreshed ? "✓" : "↻"}</button>
                  )}
                </div>
              </div>
            </PopoverSection>

            <PopoverSection label="Genre">
              <select value={genre} onChange={e => { closeSpecialViews(); onGenreChange(e.target.value); }} style={popoverSelectStyle}>
                <option value="All Genres">All Genres</option>
                {genres.map(g => <option key={g}>{g}</option>)}
              </select>
            </PopoverSection>

            {ageRatings.length > 0 && (
              <PopoverSection label="Age Rating">
                <select value={ageRating} onChange={e => { closeSpecialViews(); onAgeRatingChange(e.target.value); }} style={popoverSelectStyle}>
                  <option value="All Age Ratings">All Age Ratings</option>
                  {ageRatings.map(r => <option key={r}>{r}</option>)}
                </select>
              </PopoverSection>
            )}

            {/* Games only — platforms is empty elsewhere since
                effectivePlatform() only returns a value for Game items. */}
            {platforms.length > 0 && (
              <PopoverSection label="Platform">
                <select value={platformFilter} onChange={e => { closeSpecialViews(); onPlatformFilterChange(e.target.value); }} style={popoverSelectStyle}>
                  <option value="All Platforms">All Platforms</option>
                  {platforms.map(p => <option key={p}>{p}</option>)}
                </select>
              </PopoverSection>
            )}

            {/* Games only, once at least one has IGDB-sourced platform data
                — mirrors Steam's own "OS & Consoles" filter, distinct from
                Platform above (which store you own it on vs. OS/console). */}
            {osConsoles.length > 0 && (
              <PopoverSection label="OS & Consoles">
                <select value={osConsole} onChange={e => { closeSpecialViews(); onOsConsoleChange(e.target.value); }} style={popoverSelectStyle}>
                  <option value="All OS & Consoles">All OS & Consoles</option>
                  {osConsoles.map(p => <option key={p}>{p}</option>)}
                </select>
              </PopoverSection>
            )}

            {lists.length > 0 && (
              <PopoverSection label="List">
                <ListFilterDropdown
                  lists={lists}
                  value={listFilter}
                  onChange={id => { closeSpecialViews(); onListFilterChange(id); }}
                  onDelete={onDeleteList}
                />
              </PopoverSection>
            )}

            <PopoverSection label="Personal Rating">
              <select value={personalRating} onChange={e => { closeSpecialViews(); onPersonalRatingChange(e.target.value); }} style={popoverSelectStyle}>
                {PERSONAL_RATING_BUCKETS.map(b => <option key={b}>{b}</option>)}
              </select>
            </PopoverSection>

            <PopoverSection label="Critic Rating">
              <select value={criticRating} onChange={e => { closeSpecialViews(); onCriticRatingChange(e.target.value); }} style={popoverSelectStyle}>
                {CRITIC_RATING_BUCKETS.map(b => <option key={b}>{b}</option>)}
              </select>
            </PopoverSection>

            <PopoverSection label="Rated">
              <TriStateRow value={ratedFilter} onChange={onRatedFilterChange} options={RATED_OPTIONS} color={T.accent} />
            </PopoverSection>

            <PopoverSection label="Owned">
              <TriStateRow value={ownedFilter} onChange={onOwnedFilterChange} options={OWNED_OPTIONS} color={T.accent} />
            </PopoverSection>

            {showWebKind && (
              <PopoverSection label="Kind">
                <TriStateRow value={webKindFilter} onChange={onWebKindFilterChange} options={WEB_KIND_OPTIONS} color={T.accent} />
              </PopoverSection>
            )}

            <PopoverSection label="Hidden">
              <TriStateRow value={hiddenFilter} onChange={onHiddenFilterChange} options={HIDDEN_OPTIONS} color={T.accent} />
            </PopoverSection>
          </div>
        </>
      )}
    </>
  );
};


export default function TopBar({
  stats,
  typeTabs = TYPE_TABS, // TYPE_TABS + one tab per custom type, from App.jsx
  activeTab, onTabChange,
  quickFilter, onQuickFilterChange,
  genre, onGenreChange, genres,
  sort, onSortChange,
  search, onSearchChange,
  ownedFilter, onOwnedFilterChange,
  ratedFilter, onRatedFilterChange,
  hiddenFilter, onHiddenFilterChange,
  webKindFilter = "all", onWebKindFilterChange,
  view, onViewChange,
  tileSize, onTileSizeChange,
  tileGap, onTileGapChange,
  tileOverlay, onTileOverlayChange,
  listRowSize, onListRowSizeChange,
  ageRating, onAgeRatingChange, ageRatings,
  platformFilter, onPlatformFilterChange, platforms,
  osConsole, onOsConsoleChange, osConsoles,
  lists = [], listFilter, onListFilterChange, onDeleteList,
  personalRating, onPersonalRatingChange,
  criticRating, onCriticRatingChange,
  watchFilter, onWatchFilterChange, watchProviderOptions, watchRegion, onRefreshWatchSettings,
  onResetFilters,
  onLogoClick,
  onImport, onSettings,
  mainView, onMainViewChange,
  onOpenCustomTypeBuilder,
  hiddenTypeKeys = [], onToggleTypeHidden, onDeleteCustomType,
  typeOrder = [], onReorderTypes,
}) {
  const closeSpecialViews = () => { if (mainView === "stats" || mainView === "discover" || mainView === "history") onMainViewChange("library"); };

  // Whether anything currently narrows the library (drives the Reset button).
  // Declared before the layout hook because its dependency list reads it.
  const resetVisible = !!onResetFilters && !!(
    activeTab !== "All" || quickFilter !== "All" || genre !== "All Genres" ||
    ageRating !== "All Age Ratings" || platformFilter !== "All Platforms" || osConsole !== "All OS & Consoles" || listFilter || personalRating !== "Any Rating" ||
    criticRating !== "Any Critic Rating" || watchFilter || ownedFilter !== "all" || ratedFilter !== "all" ||
    hiddenFilter !== "visible" || (activeTab === "Web Videos" && webKindFilter !== "all") || search.trim()
  );

  // ── Top-bar layout ────────────────────────────────────────────────────────
  // All decisions are made from the items' real measured widths (never a
  // fixed pixel breakpoint — the tab count changes with custom/hidden types)
  // and never from where things currently sit, so none can flip-flop:
  //
  // 1. compact — when the full pill row + tab row + actions can't all fit on
  //    one line (the bar would otherwise wrap or scroll), the pills collapse
  //    into one status dropdown and the tabs into one type dropdown. The full
  //    versions are measured from a hidden copy, so the answer stays right
  //    while the compact ones are what's on screen.
  // 2. middleInline / middleLevel — in compact mode the Filter / Sort /
  //    Search controls sit in the middle of the top row when they fit,
  //    shrinking in stages as space runs out: Sort down to just its arrow,
  //    then Filter down to just its symbol, then Search narrows. If even that
  //    doesn't fit they stay in the second row at full size, as in full mode.
  // 3. actionsInline — the right-hand actions (stats/discover/history,
  //    display buttons, +Add, Settings) sit at the end of the top row when it
  //    can hold them, otherwise at the end of the second row.
  const barRef = useRef(null);
  const wordmarkRef = useRef(null);
  const pillsRef = useRef(null);         // hidden full pill row (measuring only)
  const tabsRef = useRef(null);          // hidden full tab row (measuring only)
  const metricsRef = useRef(null);       // hidden filter/sort/search/reset variants (measuring only)
  const compactStatusRef = useRef(null);
  const compactTypeRef = useRef(null);
  const actionsRef = useRef(null);
  const [compact, setCompact] = useState(false);
  const [actionsInline, setActionsInline] = useState(true);
  const [middleInline, setMiddleInline] = useState(false);
  const [middleLevel, setMiddleLevel] = useState(0);

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    // Sum of a flex group's children plus its own gap/padding/border — its
    // width when nothing inside it has wrapped.
    const natural = (el) => {
      const cs = getComputedStyle(el);
      const kids = [...el.children];
      const px = (v) => parseFloat(v) || 0;
      return kids.reduce((sum, k) => sum + k.offsetWidth, 0)
        + px(cs.columnGap) * Math.max(0, kids.length - 1)
        + px(cs.paddingLeft) + px(cs.paddingRight) + px(cs.borderLeftWidth) + px(cs.borderRightWidth);
    };
    const ROW_PADDING = 28, COLUMN_GAP = 8, SLACK = 4; // slack: offsetWidth is rounded per item
    const MIDDLE_GAP = 6, DIVIDER = 1;
    const measure = () => {
      const [wordmark, pills, tabs, actionsEl] = [wordmarkRef.current, pillsRef.current, tabsRef.current, actionsRef.current];
      if (!wordmark || !pills || !tabs || !actionsEl) return;
      const width = bar.clientWidth;
      const fullNeeded = ROW_PADDING + COLUMN_GAP * 3 + wordmark.offsetWidth + natural(pills) + natural(tabs) + natural(actionsEl);
      const nextCompact = width < fullNeeded + SLACK;
      let nextInline = true; // if the full layout fits, the actions fit too
      let nextMiddleInline = false;
      let nextLevel = 0;
      const cStatus = compactStatusRef.current, cType = compactTypeRef.current;
      if (nextCompact && cStatus && cType) {
        const m = {};
        metricsRef.current?.querySelectorAll("[data-m]").forEach(el => { m[el.dataset.m] = el.offsetWidth; });
        const base = ROW_PADDING + wordmark.offsetWidth + natural(cStatus) + natural(cType) + natural(actionsEl);
        const group = (filterW, sortW) => filterW + MIDDLE_GAP + DIVIDER + MIDDLE_GAP + sortW;
        const middleW = (filterW, sortW, searchW, resetW) =>
          group(filterW, sortW) + MIDDLE_GAP + searchW + (resetW ? MIDDLE_GAP + resetW : 0);
        const resetW = (short) => (resetVisible ? (short ? m.resetShort : m.resetFull) || 0 : 0);
        const needs = [
          middleW(m.filterFull, m.sortFull,  SEARCH_PX,     resetW(false)),
          middleW(m.filterFull, m.sortArrow, SEARCH_PX,     resetW(true)),
          middleW(m.filterIcon, m.sortArrow, SEARCH_PX,     resetW(true)),
          middleW(m.filterIcon, m.sortArrow, MIN_SEARCH_PX, resetW(true)),
        ];
        if (needs.every(Number.isFinite)) {
          const available = width - SLACK - (base + COLUMN_GAP * 4); // 5 items in the row, 4 gaps
          if (available >= needs[3]) {
            nextMiddleInline = true;
            nextLevel = available >= needs[0] ? 0 : available >= needs[1] ? 1 : available >= needs[2] ? 2 : 3;
          } else {
            nextInline = width >= base + COLUMN_GAP * 3 + SLACK;
          }
        }
      }
      setCompact(nextCompact);
      setActionsInline(nextInline);
      setMiddleInline(nextMiddleInline);
      setMiddleLevel(nextLevel);
    };
    measure();
    const ro = new ResizeObserver(measure);
    [bar, wordmarkRef.current, pillsRef.current, tabsRef.current, compactStatusRef.current, compactTypeRef.current, actionsRef.current,
      ...(metricsRef.current ? metricsRef.current.querySelectorAll("[data-m]") : [])]
      .forEach(el => el && ro.observe(el));
    return () => ro.disconnect();
  }, [compact, actionsInline, middleInline, view, typeTabs, hiddenTypeKeys, stats, quickFilter, activeTab, resetVisible]);

  // Shared by the full pill/tab rows, the compact dropdowns and the hidden
  // measuring copies, so they can never drift apart.
  const allTab = typeTabs.find(t => t.label === "All");
  const orderedOtherTabs = orderTypeTabs(typeTabs.filter(t => t.label !== "All"), typeOrder);
  const visibleOrdered = orderedOtherTabs.filter(t => !hiddenTypeKeys.includes(typeTabKey(t)));
  const mainBarTabs = visibleOrdered.slice(0, 7);
  const moreTabs = visibleOrdered.slice(7);
  const moreActive = moreTabs.some(t => t.label === activeTab);
  // Compact type dropdown lists everything visible — no separate "More" split.
  const dropdownTabs = [allTab, ...visibleOrdered].filter(Boolean);

  const statusOptions = [
    { value: "All",         count: stats.total,      label: "all",         color: T.accent },
    { value: "Wishlist",    count: stats.wishlist,   label: "wishlist",    color: T.blue,       hover: T.blue },
    { value: "Not Started", count: stats.notStarted, label: "not started", color: T.notStarted, hover: T.notStarted },
    { value: "In Progress", count: stats.inProgress, label: "in progress", color: T.progress,   hover: T.progress },
    { value: "Consumed",    count: stats.completed,  label: "consumed",    color: T.seen,       hover: T.seen },
    { value: "Dropped",     count: stats.dropped,    label: "dropped",     color: T.dropped,    hover: T.dropped },
  ];
  const selectStatus = (value) => { closeSpecialViews(); onQuickFilterChange(value); };
  const selectTab = (label) => { closeSpecialViews(); onTabChange(label); };

  const groupStyle = {
    pills: {
      display: "flex", gap: 4, alignItems: "center",
      padding: "0 8px", flexShrink: 0,
      borderLeft: `1px solid ${T.border}`,
      borderRight: `1px solid ${T.border}`,
    },
    tabs: {
      display: "flex", alignItems: "center", gap: 1, flexShrink: 0,
      borderRight: `1px solid ${T.border}`, paddingRight: 8,
    },
  };

  const manageMenu = (
    <ManageTypesMenu
      typeTabs={orderedOtherTabs}
      hiddenTypeKeys={hiddenTypeKeys}
      onToggleTypeHidden={onToggleTypeHidden}
      onDeleteCustomType={onDeleteCustomType}
      onOpenCustomTypeBuilder={onOpenCustomTypeBuilder}
      onReorderTypes={onReorderTypes}
    />
  );

  const pillsGroup = (ref) => (
    <div ref={ref} style={groupStyle.pills}>
      {statusOptions.map(o => (
        <StatFilterPill
          key={o.value}
          count={o.count} label={o.label}
          active={quickFilter === o.value}
          activeColor={o.color} hoverColor={o.hover}
          onClick={() => selectStatus(o.value)}
        />
      ))}
    </div>
  );

  const tabsGroup = (ref) => (
    <div ref={ref} style={groupStyle.tabs}>
      {allTab && (
        <TabBtn tab={allTab} active={activeTab === allTab.label} onClick={() => selectTab(allTab.label)} />
      )}
      {mainBarTabs.map(tab => (
        <TabBtn key={tab.label} tab={tab} active={activeTab === tab.label} onClick={() => selectTab(tab.label)} />
      ))}
      <MoreTypesMenu tabs={moreTabs} active={moreActive} onSelect={selectTab} />
      {manageMenu}
    </div>
  );

  // Filter / Sort / Search / Reset. Built once and used by the second row, the
  // top-row middle group (at whichever shrink level fits) and the hidden
  // measuring copies, so they can never drift apart.

  // Genre/Age Rating/Lists/Personal & Critic Rating/Where to Watch/Rated/
  // Owned are all consolidated behind this button, see FilterButton's comment.
  const filterEl = (iconOnly) => (
    <FilterButton
      iconOnly={iconOnly}
      ratedFilter={ratedFilter} onRatedFilterChange={onRatedFilterChange}
      ownedFilter={ownedFilter} onOwnedFilterChange={onOwnedFilterChange}
      hiddenFilter={hiddenFilter} onHiddenFilterChange={onHiddenFilterChange}
      webKindFilter={webKindFilter} onWebKindFilterChange={onWebKindFilterChange} showWebKind={activeTab === "Web Videos"}
      genre={genre} onGenreChange={onGenreChange} genres={genres}
      ageRating={ageRating} onAgeRatingChange={onAgeRatingChange} ageRatings={ageRatings}
      platformFilter={platformFilter} onPlatformFilterChange={onPlatformFilterChange} platforms={platforms}
      osConsole={osConsole} onOsConsoleChange={onOsConsoleChange} osConsoles={osConsoles}
      lists={lists} listFilter={listFilter} onListFilterChange={onListFilterChange} onDeleteList={onDeleteList}
      personalRating={personalRating} onPersonalRatingChange={onPersonalRatingChange}
      criticRating={criticRating} onCriticRatingChange={onCriticRatingChange}
      watchFilter={watchFilter} onWatchFilterChange={onWatchFilterChange}
      watchProviderOptions={watchProviderOptions} watchRegion={watchRegion}
      onRefreshWatchSettings={onRefreshWatchSettings}
      onSettings={onSettings} closeSpecialViews={closeSpecialViews}
    />
  );

  const selectSort = (value) => { closeSpecialViews(); onSortChange(value); };
  const sortEl = (arrowOnly) => arrowOnly ? (
    <SortArrowDropdown options={SORT_OPTIONS} value={sort} onChange={selectSort} />
  ) : (
    <FilterField label="Sort">
      <select value={sort} onChange={e => selectSort(e.target.value)} style={selectStyle}>
        {SORT_OPTIONS.map(o => <option key={o}>{o}</option>)}
      </select>
    </FilterField>
  );

  // Starts at its original width (SEARCH_PX) and may shrink toward
  // MIN_SEARCH_PX when the top row runs short of room.
  const searchEl = (
    <div style={{ position: "relative", flex: `0 1 ${SEARCH_PX}px`, minWidth: MIN_SEARCH_PX }}>
      <input
        value={search}
        onChange={e => { closeSpecialViews(); onSearchChange(e.target.value); }}
        placeholder="Search…"
        style={{
          width: "100%", boxSizing: "border-box", padding: "4px 10px 4px 26px",
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: 5, color: T.text, fontSize: 11,
          outline: "none", fontFamily: T.fontSans,
        }}
      />
      <span style={{
        position: "absolute", left: 8, top: "50%",
        transform: "translateY(-50%)", color: T.muted, fontSize: 12,
        pointerEvents: "none",
      }}>⌕</span>
    </div>
  );

  // Only shown once something actually narrows the library. Doesn't touch
  // sort or view/tile/list display prefs, since neither hides any items.
  const resetEl = (short) => (
    <button
      onClick={() => { closeSpecialViews(); onResetFilters(); }}
      title="Reset all filters"
      style={{
        height: 26, padding: short ? "0 8px" : "0 10px", flexShrink: 0,
        border: `1px solid rgba(232,75,110,0.3)`, borderRadius: 4,
        background: "transparent", color: "#e84b6e",
        fontSize: 10, fontWeight: 600, fontFamily: T.fontMono,
        cursor: "pointer", transition: "all 0.12s",
      }}
    >{short ? "✕" : "✕ Reset Filters"}</button>
  );

  // level 0 = everything full; 1 = Sort as its arrow; 2 = Filter as its
  // symbol too; 3 = same as 2 (Search is what flexes, via its own shrink).
  const middle = (level) => (
    <>
      {/* Filter + divider + Sort travel as one unit so the divider never
          ends up stranded at the end or start of a wrapped line. */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {filterEl(level >= 2)}
        <div style={{ width: 1, height: 16, background: T.border, flexShrink: 0 }} />
        {sortEl(level >= 1)}
      </div>
      {searchEl}
      {resetVisible && resetEl(level >= 1)}
    </>
  );

  // Right-hand actions, kept together. marginLeft auto pushes the group
  // to the end of whatever line it lands on (what the old flex spacer
  // did); the paddingLeft keeps the spacer's extra 8px minimum gap, so
  // nothing shifts at full width.
  const actions = (
  <div ref={actionsRef} style={{ display: "flex", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end", gap: "6px 8px", marginLeft: "auto", paddingLeft: 8 }}>

  {/* Stats toggle */}
  <IconBtn
    active={mainView === "stats"}
    activeColor={T.accent}
    onClick={() => onMainViewChange(mainView === "stats" ? "library" : "stats")}
    title="Stats"
  >
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 8 L8 1.5 A6.5 6.5 0 0 1 14.5 8 Z" fill="currentColor" />
    </svg>
  </IconBtn>

  {/* Discover toggle */}
  <IconBtn
    active={mainView === "discover"}
    activeColor={T.accent}
    onClick={() => onMainViewChange(mainView === "discover" ? "library" : "discover")}
    title="Discover"
  >
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10.5 5.5 L9 9 L5.5 10.5 L7 7 Z" fill="currentColor" />
    </svg>
  </IconBtn>

  {/* Completed History toggle — chronological list, its own tab since
      it's a browsable history, not a chart. */}
  <IconBtn
    active={mainView === "history"}
    activeColor={T.accent}
    onClick={() => onMainViewChange(mainView === "history" ? "library" : "history")}
    title="History (everything you have consumed)"
  >
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M8 3.5 V8 L11 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  </IconBtn>

  {/* Tile size + spacing — single cycling buttons, only in tile view */}
  {view === "tile" && (<>
    {(() => {
      const sizes = ["small", "medium", "large"];
      const sizeLabels = { small: "S", medium: "M", large: "L" };
      const nextSize = sizes[(sizes.indexOf(tileSize) + 1) % sizes.length];
      return (
        <button
          onClick={() => { closeSpecialViews(); onTileSizeChange(nextSize); }}
          title={`Tile size: ${tileSize} (click to cycle)`}
          style={{
            width: 28, height: 26, border: `1px solid ${T.border}`,
            borderRadius: 4, background: T.accent + "22",
            color: T.accent, fontSize: 10, fontWeight: 700,
            cursor: "pointer", fontFamily: T.fontMono,
            flexShrink: 0, transition: "all 0.12s",
          }}
        >{sizeLabels[tileSize]}</button>
      );
    })()}

    {(() => {
      const gaps = ["small", "medium", "large"];
      const gapLabels = { small: "·", medium: "··", large: "···" };
      const nextGap = gaps[(gaps.indexOf(tileGap) + 1) % gaps.length];
      return (
        <button
          onClick={() => { closeSpecialViews(); onTileGapChange(nextGap); }}
          title={`Spacing: ${tileGap} (click to cycle)`}
          style={{
            width: 28, height: 26, border: `1px solid ${T.border}`,
            borderRadius: 4, background: T.accent + "22",
            color: T.accent, fontSize: 12, fontWeight: 700,
            cursor: "pointer", fontFamily: T.fontMono,
            letterSpacing: "0.15em", flexShrink: 0, transition: "all 0.12s",
          }}
        >{gapLabels[tileGap]}</button>
      );
    })()}

    {(() => {
      const overlays = ["full", "no-icon", "none"];
      const overlayLabels = { full: "TI", "no-icon": "T", none: "—" };
      const overlayTitles = { full: "Text & icon (click to cycle)", "no-icon": "Text only", none: "Hidden" };
      const nextOverlay = overlays[(overlays.indexOf(tileOverlay) + 1) % overlays.length];
      return (
        <button
          onClick={() => { closeSpecialViews(); onTileOverlayChange(nextOverlay); }}
          title={overlayTitles[tileOverlay]}
          style={{
            width: 28, height: 26, border: `1px solid ${T.border}`,
            borderRadius: 4, background: T.accent + "22",
            color: T.accent, fontSize: 10, fontWeight: 700,
            cursor: "pointer", fontFamily: T.fontMono,
            flexShrink: 0, transition: "all 0.12s",
          }}
        >{overlayLabels[tileOverlay]}</button>
      );
    })()}
  </>)}

  {/* Row size — same cycling-button pattern as tile size, only in list view */}
  {view === "list" && (() => {
    const sizes = ["small", "medium", "large"];
    const sizeLabels = { small: "S", medium: "M", large: "L" };
    const nextSize = sizes[(sizes.indexOf(listRowSize) + 1) % sizes.length];
    return (
      <button
        onClick={() => { closeSpecialViews(); onListRowSizeChange(nextSize); }}
        title={`Row size: ${listRowSize} (click to cycle)`}
        style={{
          width: 28, height: 26, border: `1px solid ${T.border}`,
          borderRadius: 4, background: T.accent + "22",
          color: T.accent, fontSize: 10, fontWeight: 700,
          cursor: "pointer", fontFamily: T.fontMono,
          flexShrink: 0, transition: "all 0.12s",
        }}
      >{sizeLabels[listRowSize]}</button>
    );
  })()}

  {/* View toggle — single cycling button, same pattern as the size buttons */}
  {(() => {
    const views = ["tile", "list"];
    const viewIcons = { tile: "⊞", list: "☰" };
    const viewLabels = { tile: "Tile", list: "List" };
    const nextView = views[(views.indexOf(view) + 1) % views.length];
    return (
      <button
        onClick={() => { closeSpecialViews(); onViewChange(nextView); }}
        title={`View: ${viewLabels[view]} (click to cycle)`}
        style={{
          width: 28, height: 26, border: `1px solid ${T.border}`,
          borderRadius: 4, background: T.accent + "22",
          color: T.accent, fontSize: 13, fontWeight: 700,
          cursor: "pointer", fontFamily: T.fontMono,
          flexShrink: 0, transition: "all 0.12s",
        }}
      >{viewIcons[view]}</button>
    );
  })()}

  <PrimaryBtn onClick={() => { closeSpecialViews(); onImport(); }}>+Add</PrimaryBtn>
  <IconBtn onClick={onSettings} title="Settings">⚙</IconBtn>
  </div>
  );

  return (
    <div ref={barRef} style={{ background: T.topbar, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>

      {/* Hidden, never interactive: the full pill and tab rows, plus each size
          variant of Filter / Sort / Search / Reset, laid out at their natural
          width purely so the layout logic above can measure them even while
          other variants are what's showing. Zero-size and clipped so it adds
          nothing to the page's scrollable area; visibility:hidden also keeps
          it out of the tab order. */}
      <div aria-hidden="true" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden", visibility: "hidden", pointerEvents: "none" }}>
        <div style={{ display: "flex", gap: 8, width: "max-content" }}>
          {pillsGroup(pillsRef)}
          {tabsGroup(tabsRef)}
        </div>
        <div ref={metricsRef} style={{ display: "flex", gap: 8, width: "max-content" }}>
          <span data-m="filterFull" style={{ display: "inline-flex" }}>{filterEl(false)}</span>
          <span data-m="filterIcon" style={{ display: "inline-flex" }}>{filterEl(true)}</span>
          <span data-m="sortFull" style={{ display: "inline-flex" }}>{sortEl(false)}</span>
          <span data-m="sortArrow" style={{ display: "inline-flex" }}>{sortEl(true)}</span>
          {resetVisible && (
            <>
              <span data-m="resetFull" style={{ display: "inline-flex" }}>{resetEl(false)}</span>
              <span data-m="resetShort" style={{ display: "inline-flex" }}>{resetEl(true)}</span>
            </>
          )}
        </div>
      </div>

      {/* ── Row 1: Wordmark · Stats · Type tabs · [Filter · Sort · Search] · Actions ──
          Wraps onto extra lines instead of scrolling sideways when the window
          is too narrow. minHeight (not height) 46 with a little vertical
          padding keeps the single-line look identical: the one line stretches
          to fill and its items stay centred. The filter/sort/search group
          only lives here in compact mode, when it fits (see the layout hook). */}
      <div style={{
        display: "flex", alignItems: "center", flexWrap: "wrap",
        gap: "6px 8px", minHeight: 46, boxSizing: "border-box", padding: "3px 14px",
      }}>

        {/* Wordmark */}
        <div ref={wordmarkRef} style={{ flexShrink: 0 }}>
          <Wordmark onClick={() => { closeSpecialViews(); onLogoClick?.(); }} />
        </div>

        {compact ? (
          <>
            <div ref={compactStatusRef} style={groupStyle.pills}>
              <StatusDropdown options={statusOptions} value={quickFilter} onChange={selectStatus} />
            </div>
            <div ref={compactTypeRef} style={groupStyle.tabs}>
              <TypeDropdown tabs={dropdownTabs} activeTab={activeTab} onSelect={selectTab} />
              {manageMenu}
            </div>
          </>
        ) : (
          <>
            {pillsGroup(null)}
            {tabsGroup(null)}
          </>
        )}

        {/* Centred in whatever room is left between the type group and the
            actions; minWidth 0 lets Search shrink instead of forcing a wrap. */}
        {middleInline && (
          <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {middle(middleLevel)}
          </div>
        )}

        {actionsInline && actions}
      </div>

      {/* ── Row 2: Filters — only when something still lives here: the
          filter/sort/search group when it doesn't fit in the top row (and
          always in full mode), and the actions when they don't fit either ── */}
      {(!middleInline || !actionsInline) && (
        <div style={{
          display: "flex", alignItems: "center", gap: "6px 6px",
          padding: "0 14px 7px", flexWrap: "wrap",
        }}>
          {!middleInline && middle(0)}
          {!actionsInline && actions}
        </div>
      )}
    </div>
  );
}
