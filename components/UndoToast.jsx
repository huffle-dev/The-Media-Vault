import { useState, useEffect } from "react";
import { T } from "../tokens.js";

// "Last action" undo toast — delete/hide/status share this one component.
// Anchored top-right under the TopBar's +Add button, rather than a bottom
// corner like the background-progress chips (Auto-Update/enrichment). The
// countdown bar animates via a mount-triggered width flip (100% -> 0% over
// `durationMs`, plain CSS transition) instead of a ticking setInterval,
// same technique the enrichment chips' progress bar uses.
export default function UndoToast({ label, durationMs, onUndo }) {
  const [drained, setDrained] = useState(false);
  // Slide-down + fade entrance, same mount-triggered flip technique as the
  // countdown bar below.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => { setDrained(true); setEntered(true); });
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div style={{
      position: "fixed", top: 46, right: 16, zIndex: 300,
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 8, padding: "10px 14px", minWidth: 220,
      boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
      opacity: entered ? 1 : 0,
      transform: entered ? "translateY(0)" : "translateY(-12px)",
      transition: "opacity 0.2s ease, transform 0.2s ease",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: T.text, fontFamily: T.fontSans }}>{label}</span>
        <button onClick={onUndo} style={{
          background: "none", border: "none", color: T.accent,
          fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.fontMono,
          textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0,
        }}>Undo</button>
      </div>
      <div style={{ height: 5, background: T.border, borderRadius: 99, overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 99, background: T.accent,
          width: drained ? "0%" : "100%",
          transition: `width ${durationMs}ms linear`,
        }} />
      </div>
    </div>
  );
}
