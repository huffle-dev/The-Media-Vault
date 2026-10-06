import { useState } from "react";
import { T, cleanIpcError } from "../tokens.js";

// "Add to List" popover — existing lists plus an inline "create + add" field.
// Used from both App.jsx's multi-select bar (bulk add) and ItemProfile.jsx's
// header (single item), each passing its own onAddToList. Kept as its own
// component so both can import it without a circular App.jsx/ItemProfile
// dependency.
export default function AddToListMenu({ lists, onAddToList, onCreateList, onDeleteList, label = "☆ Add to List" }) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState("");
  const [triggerHovered, setTriggerHovered] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    setErr("");
    try {
      const list = await onCreateList(newName.trim());
      await onAddToList(list.id);
      setNewName("");
      setOpen(false);
    } catch (e) {
      setErr(cleanIpcError(e) || "Failed to create list.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        onMouseEnter={() => setTriggerHovered(true)}
        onMouseLeave={() => setTriggerHovered(false)}
        style={{
          padding: "4px 14px",
          background: triggerHovered || open ? T.accent + "33" : T.accent + "22",
          border: `1px solid ${triggerHovered || open ? T.accent + "99" : T.accent + "66"}`,
          borderRadius: 5,
          color: T.accent, fontSize: 11, cursor: "pointer",
          fontFamily: T.fontSans,
          transition: "background 0.12s, border-color 0.12s",
        }}
      >{label}</button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0,
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6,
          padding: 6, minWidth: 190, maxHeight: 260, overflowY: "auto", zIndex: 50,
          display: "flex", flexDirection: "column", gap: 2,
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        }}>
          {lists.map(l => (
            <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <button
                onClick={() => { onAddToList(l.id); setOpen(false); }}
                style={{
                  flex: 1, textAlign: "left", padding: "5px 8px", background: "none",
                  border: "none", color: T.text, fontSize: 11, cursor: "pointer",
                  borderRadius: 4, fontFamily: T.fontSans,
                }}
              >{l.is_default ? "☆ " : ""}{l.name}</button>
              {!l.is_default && (
                <button
                  onClick={() => { if (confirm(`Delete the list "${l.name}"? Items stay in your library.`)) onDeleteList(l.id); }}
                  title={`Delete "${l.name}"`}
                  style={{
                    flexShrink: 0, width: 20, height: 20, background: "none",
                    border: "none", color: T.muted, fontSize: 12, cursor: "pointer",
                    borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >✕</button>
              )}
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 4, paddingTop: 4, display: "flex", gap: 4 }}>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreate()}
              placeholder="New list…"
              style={{
                flex: 1, fontSize: 11, padding: "4px 6px",
                background: T.bg, border: `1px solid ${T.border}`,
                borderRadius: 4, color: T.text, fontFamily: T.fontSans,
              }}
            />
            <button
              onClick={handleCreate}
              disabled={creating}
              style={{
                fontSize: 11, padding: "4px 9px", background: T.accent,
                color: T.bg, border: "none", borderRadius: 4,
                cursor: "pointer", fontWeight: 700,
              }}
            >+</button>
          </div>
          {err && <div style={{ fontSize: 10, color: "#e84b6e", padding: "2px 4px" }}>{err}</div>}
        </div>
      )}
    </div>
  );
}
