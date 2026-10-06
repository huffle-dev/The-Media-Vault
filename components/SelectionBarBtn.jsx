import { useState } from "react";
import { T } from "../tokens.js";

// Selection bar's own buttons — plain (Select all/Deselect all, text-only),
// action (Set Status/Owned/Export, accent pill), danger (Delete, red pill).
// `success` briefly overrides to T.seen regardless of variant, for the
// bulk-action confirmation flash (see App.jsx's flashBulkFeedback).
const SELECTION_BAR_VARIANTS = {
  plain:  { color: T.muted, hoverColor: T.text, bg: "transparent", hoverBg: T.surface, border: "transparent", hoverBorder: T.border },
  action: { color: T.accent, hoverColor: T.accent, bg: T.accent + "22", hoverBg: T.accent + "33", border: T.accent + "66", hoverBorder: T.accent + "99" },
  danger: { color: "#e84b6e", hoverColor: "#e84b6e", bg: "rgba(232,75,110,0.15)", hoverBg: "rgba(232,75,110,0.25)", border: "rgba(232,75,110,0.4)", hoverBorder: "rgba(232,75,110,0.6)" },
};

export default function SelectionBarBtn({ onClick, variant = "action", success = false, buttonRef, children }) {
  const [hovered, setHovered] = useState(false);
  const v = SELECTION_BAR_VARIANTS[variant];
  return (
    <button
      ref={buttonRef}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: variant === "plain" ? "2px 6px" : "4px 14px",
        background: success ? T.seen + "22" : (hovered ? v.hoverBg : v.bg),
        border: `1px solid ${success ? T.seen + "66" : (hovered ? v.hoverBorder : v.border)}`,
        borderRadius: 5,
        color: success ? T.seen : (hovered ? v.hoverColor : v.color),
        fontSize: 11, cursor: "pointer",
        fontFamily: variant === "plain" ? T.fontMono : T.fontSans,
        transition: "background 0.12s, border-color 0.12s, color 0.12s",
      }}
    >{children}</button>
  );
}
