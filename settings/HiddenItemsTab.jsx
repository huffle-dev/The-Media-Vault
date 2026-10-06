// Settings → Hidden Items tab: two separate lists — library items you've
// hidden (is_hidden) and Discovery titles dismissed with "Not Interested".
// Same word, different mechanisms — kept as clearly separate sections here
// so restoring one never gets confused with the other.
//
// Discovery dismissals in particular have no upper bound — every "Not
// Interested" click adds one, forever, with no corresponding way to trim
// them apart from Restore — so that list gets a search box and a sort
// control once it's non-trivially long; the DB already returns it
// newest-first, so "Newest" needs no client-side re-sort.
import { useState, useEffect, useMemo } from "react";
import { T } from "../tokens.js";
import { Group, Card, actionBtnStyle, typeDisplayLabel, inputStyle } from "./SettingsShared.jsx";

const DISMISSED_SORTS = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "az",     label: "Title A–Z" },
  { key: "za",     label: "Title Z–A" },
];

export default function HiddenItemsTab({ items, onLibraryUpdate }) {
  // Discovery dismissals — fetched on mount, since this component only
  // mounts once its tab is switched to. Library items need no fetch of
  // their own — `items` is the App-level source of truth, filtered here
  // and refreshed via the same onLibraryUpdate() every mutating action calls.
  const [dismissedItems, setDismissedItems] = useState([]);
  const [loadingDismissed, setLoadingDismissed] = useState(false);
  const [dismissedSearch, setDismissedSearch] = useState("");
  const [dismissedSort, setDismissedSort] = useState("newest");
  useEffect(() => {
    setLoadingDismissed(true);
    window.vault.discovery.getDismissed().then(setDismissedItems).finally(() => setLoadingDismissed(false));
  }, []);

  const visibleDismissed = useMemo(() => {
    const q = dismissedSearch.trim().toLowerCase();
    const filtered = q ? dismissedItems.filter(d => (d.title || "").toLowerCase().includes(q)) : dismissedItems;
    // "newest" needs no re-sort — getDiscoveryDismissals() already returns
    // that order from the DB, and re-sorting a copy on every keystroke
    // would be wasted work for the common case.
    if (dismissedSort === "oldest") return [...filtered].reverse();
    if (dismissedSort === "az") return [...filtered].sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    if (dismissedSort === "za") return [...filtered].sort((a, b) => (b.title || "").localeCompare(a.title || ""));
    return filtered;
  }, [dismissedItems, dismissedSearch, dismissedSort]);

  const hiddenLibraryItems = items.filter(i => i.is_hidden);

  const handleUnhideItem = async (id) => {
    await window.vault.items.updateFields(id, { is_hidden: 0 });
    if (onLibraryUpdate) onLibraryUpdate();
  };

  const handleUndismiss = async (id) => {
    setDismissedItems(prev => prev.filter(d => d.id !== id));
    await window.vault.discovery.undismiss(id);
  };

  const rowStyle = {
    display: "flex", alignItems: "center", gap: 10,
    padding: "8px 10px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6,
  };
  const titleStyle = { fontSize: 13, color: T.text, fontFamily: T.fontSerif, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
  const metaStyle = { fontSize: 10, color: T.muted, fontFamily: T.fontMono };
  const emptyStyle = { fontSize: 12, color: T.dim, fontFamily: T.fontMono };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Group title="Your library">
        <Card title="Hidden items" blurb="Things you've hidden from your library. They're still saved — unhide to bring them back.">
          {hiddenLibraryItems.length === 0 ? (
            <div style={emptyStyle}>Nothing hidden.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {hiddenLibraryItems.map(item => (
                <div key={item.id} style={rowStyle}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={titleStyle}>{item.title}</div>
                    <div style={metaStyle}>{typeDisplayLabel(item.media_type)}</div>
                  </div>
                  <button onClick={() => handleUnhideItem(item.id)} style={actionBtnStyle(false)}>Unhide</button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </Group>

      <Group title="Discover">
        <Card title="Not interested" blurb={`Titles you've passed on in Discover. They won't be recommended again unless you restore them.`}>
          {loadingDismissed ? (
            <div style={emptyStyle}>Loading…</div>
          ) : dismissedItems.length === 0 ? (
            <div style={emptyStyle}>Nothing dismissed yet.</div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input
                  value={dismissedSearch}
                  onChange={e => setDismissedSearch(e.target.value)}
                  placeholder="Search titles…"
                  style={{ ...inputStyle, background: T.surface, flex: 1 }}
                />
                <select
                  value={dismissedSort}
                  onChange={e => setDismissedSort(e.target.value)}
                  style={{
                    padding: "7px 11px",
                    background: T.surface, border: `1px solid ${T.border}`,
                    borderRadius: 5, color: T.text, fontSize: 12,
                    outline: "none", fontFamily: T.fontSans, flexShrink: 0,
                  }}
                >
                  {DISMISSED_SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
              <div style={{ ...metaStyle, marginBottom: 8 }}>
                {visibleDismissed.length === dismissedItems.length
                  ? `${dismissedItems.length} title${dismissedItems.length === 1 ? "" : "s"}`
                  : `${visibleDismissed.length} of ${dismissedItems.length} titles`}
              </div>
              {visibleDismissed.length === 0 ? (
                <div style={emptyStyle}>No titles match "{dismissedSearch}".</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {visibleDismissed.map(d => (
                    <div key={d.id} style={rowStyle}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={titleStyle}>{d.title || "(untitled)"}</div>
                        <div style={metaStyle}>{d.media_type} · dismissed {(d.dismissed_at || "").split(" ")[0]}</div>
                      </div>
                      <button onClick={() => handleUndismiss(d.id)} style={actionBtnStyle(false)}>Restore</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Card>
      </Group>
    </div>
  );
}
