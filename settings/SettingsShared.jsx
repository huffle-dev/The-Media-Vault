// Small pieces shared across SettingsModal's tab components. Kept
// deliberately tiny: pure presentational helpers with no state of their own
// (KeyInput's show/hide toggle is the one exception, local to each instance).
import { useState } from "react";
import { T, TYPE_TABS } from "../tokens.js";

// MEDIA_TYPES.label is the literal media_type DB string ("Movie", "Book"...)
// — TYPE_TABS.label is the display name TopBar shows ("Movies", "Books"...).
// This looks up the latter so Settings names match the tab bar. length===1
// is what distinguishes a real single-type tab from "All" (whose `includes`
// array spans every type).
export const typeDisplayLabel = (mediaType) =>
  TYPE_TABS.find(t => !t.isCustom && t.includes && t.includes.length === 1 && t.includes[0] === mediaType)?.label || mediaType;

export const Label = ({ children }) => (
  <label style={{
    fontSize: 9, color: T.muted, display: "block", marginBottom: 5,
    fontFamily: T.fontMono, letterSpacing: "0.08em",
    textTransform: "uppercase",
  }}>{children}</label>
);

export const SectionTitle = ({ children }) => (
  <div style={{
    fontSize: 9, color: T.accent, fontFamily: T.fontMono,
    letterSpacing: "0.1em", textTransform: "uppercase",
    marginBottom: 14, paddingBottom: 6,
    borderBottom: `1px solid ${T.border}`,
  }}>{children}</div>
);

// A saved API key is otherwise permanently masked. One 👁 glyph toggles both
// states (accent when revealed, muted otherwise) rather than swapping
// between two different icons.
export const KeyInput = ({ value, onChange, placeholder, inputStyle }) => {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: "relative", flex: 1 }}>
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={{ ...inputStyle, paddingRight: 32 }}
      />
      <span
        onClick={() => setVisible(v => !v)}
        title={visible ? "Hide key" : "Show key"}
        style={{
          position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)",
          cursor: "pointer", fontSize: 13, lineHeight: 1,
          color: visible ? T.accent : T.muted,
        }}
      >👁</span>
    </div>
  );
};

export const inputStyle = {
  width: "100%", padding: "7px 11px", boxSizing: "border-box",
  background: T.surface2, border: `1px solid ${T.border}`,
  borderRadius: 5, color: T.text, fontSize: 12,
  outline: "none", fontFamily: T.fontSans,
};

export const actionBtnStyle = (running) => ({
  padding: "8px 18px", background: running ? T.surface2 : T.hoverWashStrong,
  border: `1px solid ${T.border}`, borderRadius: 5,
  color: running ? T.muted : T.text, fontSize: 12,
  cursor: running ? "not-allowed" : "pointer",
  fontFamily: T.fontSans,
});

// Wraps a set of numbered setup steps (an <ol>, typically) behind a
// click-to-expand label — collapsed by default so a tab with several API
// keys doesn't show every provider's full signup walkthrough at once.
export const CollapsibleSteps = ({ label = "How to get a free key", children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <span
        onClick={() => setOpen(o => !o)}
        style={{ cursor: "pointer", color: T.dim, userSelect: "none" }}
      >
        <span style={{ display: "inline-block", width: 10, color: T.muted }}>{open ? "▾" : "▸"}</span>
        {label}
      </span>
      {open && children}
    </div>
  );
};

export const progressBar = (done, total) => (
  <div style={{ marginTop: 8, height: 3, background: T.border, borderRadius: 99, overflow: "hidden" }}>
    <div style={{
      height: "100%", borderRadius: 99, background: T.seen,
      width: `${(done / total) * 100}%`, transition: "width 0.3s",
    }} />
  </div>
);

// ── Card layout ────────────────────────────────────────────────────────────
// The Welcome screen's design, shared by every Settings tab: small accent
// group headings, each holding cards that say in one line what a thing
// does, followed by only the controls it needs.

export const Group = ({ title, children, groupRef }) => (
  <div ref={groupRef} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    <div style={{
      fontSize: 9, color: T.accent, fontFamily: T.fontMono,
      letterSpacing: "0.1em", textTransform: "uppercase",
    }}>{title}</div>
    {children}
  </div>
);

// `tag` is a small pill beside the title (e.g. "Recommended"); `done` shows
// a "✓ Set up" badge on the right; `aside` replaces that badge with any
// other right-aligned node (e.g. a Reset button).
export const Card = ({ title, blurb, tag, done, aside, children }) => (
  <div style={{
    padding: "14px 16px", background: T.surface2,
    border: `1px solid ${T.border}`, borderRadius: 8,
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: blurb ? 3 : (children ? 10 : 0) }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{title}</div>
      {tag && (
        <span style={{
          fontSize: 9, fontFamily: T.fontMono, letterSpacing: "0.06em", textTransform: "uppercase",
          padding: "2px 7px", borderRadius: 100, border: `1px solid ${T.accent}`, color: T.accent,
        }}>{tag}</span>
      )}
      {aside
        ? <div style={{ marginLeft: "auto" }}>{aside}</div>
        : done && <span style={{ marginLeft: "auto", fontSize: 11, color: T.seen, fontFamily: T.fontMono }}>✓ Set up</span>}
    </div>
    {blurb && (
      <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5, marginBottom: children ? 10 : 0 }}>{blurb}</div>
    )}
    {children}
  </div>
);

// Numbered signup steps, collapsed behind "▸ How to get a free key".
export const Steps = ({ label, children }) => (
  <div style={{ fontSize: 10, color: T.muted, marginTop: 6, fontFamily: T.fontMono, lineHeight: 1.8 }}>
    <CollapsibleSteps label={label}>
      <ol style={{ margin: "3px 0 0", paddingLeft: 16 }}>{children}</ol>
    </CollapsibleSteps>
  </div>
);

export const Toggle = ({ checked, onChange, disabled, children, first = false }) => (
  <label style={{
    display: "flex", alignItems: "center", gap: 8, marginTop: first ? 0 : 10,
    fontSize: 12, color: disabled ? T.muted : T.text,
    cursor: disabled ? "default" : "pointer", fontFamily: T.fontSans,
  }}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
    {children}
  </label>
);

// A one-line result under a button — green for a success string, red for
// { error }. Renders nothing when there's no message.
export const StatusMsg = ({ msg }) => msg ? (
  <div style={{
    marginTop: 10, fontSize: 11, fontFamily: T.fontMono, lineHeight: 1.5,
    color: msg.error ? "#e84b6e" : T.seen,
  }}>{msg.error || msg}</div>
) : null;

// Progress/summary line for a long-running background job, with its bar.
export const ProgressBox = ({ text, done, total }) => (
  <div style={{
    marginTop: 10, padding: "8px 12px",
    background: T.surface, border: `1px solid ${T.border}`,
    borderRadius: 6, fontSize: 11, fontFamily: T.fontMono, color: T.text,
  }}>
    {text}
    {total > 0 && progressBar(done, total)}
  </div>
);

export const extLink = (url, text) => (
  <span
    onClick={() => window.vault.shell.openExternal(url)}
    style={{ color: T.accent, cursor: "pointer", textDecoration: "underline" }}
  >{text}</span>
);

export const saveBtnStyle = (saved) => ({
  padding: "7px 16px", background: saved ? T.seen : T.accent,
  color: T.bg, border: "none", borderRadius: 5,
  fontSize: 12, fontWeight: 700, cursor: "pointer",
  fontFamily: T.fontSans, flexShrink: 0, transition: "background 0.2s",
});
