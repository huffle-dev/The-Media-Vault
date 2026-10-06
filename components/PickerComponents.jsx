import { useState, useEffect, useRef } from "react";
import { T, CUSTOM_COLOR_PATTERN } from "../tokens.js";

// Small filled circle swatch picker, shared by every color-editing row in
// the app (Settings' accent/status/text/media-type colors, Custom Type
// Builder's color field) — a native OS color picker (rainbow-gradient
// circle wrapping a hidden <input type="color">) plus a hex text input sit
// alongside the curated swatches, so any arbitrary color is one click away.
export const ColorSwatchPicker = ({ current, onPick, swatches }) => {
  const [custom, setCustom] = useState(current);

  useEffect(() => { setCustom(current); }, [current]);

  const handleCustomChange = (value) => {
    setCustom(value);
    if (CUSTOM_COLOR_PATTERN.test(value)) onPick(value);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {swatches.map(color => (
          <span
            key={color}
            onClick={() => { onPick(color); setCustom(color); }}
            title={color}
            style={{
              width: 26, height: 26, borderRadius: "50%", background: color,
              border: `2px solid ${current.toLowerCase() === color.toLowerCase() ? T.accent : "transparent"}`,
              cursor: "pointer",
            }}
          />
        ))}
        <label
          title="Pick any color"
          style={{
            position: "relative", width: 26, height: 26, borderRadius: "50%",
            cursor: "pointer", display: "inline-block", flexShrink: 0,
            background: "conic-gradient(from 0deg, red, yellow, lime, cyan, blue, magenta, red)",
            border: `1px solid ${T.border}`,
          }}
        >
          <input
            type="color"
            value={CUSTOM_COLOR_PATTERN.test(current) ? current : "#000000"}
            onChange={e => { onPick(e.target.value); setCustom(e.target.value); }}
            style={{
              position: "absolute", inset: 0, width: "100%", height: "100%",
              opacity: 0, cursor: "pointer", border: "none", padding: 0,
            }}
          />
        </label>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ width: 20, height: 20, borderRadius: 4, background: CUSTOM_COLOR_PATTERN.test(custom) ? custom : T.surface2, border: `1px solid ${T.border}`, flexShrink: 0 }} />
        <input
          value={custom}
          onChange={e => handleCustomChange(e.target.value)}
          placeholder="#rrggbb"
          style={{
            width: 90, padding: "5px 9px", background: T.surface2,
            border: `1px solid ${T.border}`, borderRadius: 5,
            color: T.text, fontSize: 11, fontFamily: T.fontMono, outline: "none",
          }}
        />
      </div>
    </div>
  );
};

// Curated grid for the picker dropdown — broad enough to cover most media/
// object/misc choices without pulling in a full emoji database dependency.
const EMOJI_PICKER_CHOICES = [
  "🎬","📺","📖","🎧","🎮","🎵","🎲","🎴","📚","📹","🐉","🔗","🎙️",
  "💿","🍷","🧸","⛏️","💎","🕹️","🖼️","🧩","🪙","🧵","📻","🔭",
  "📷","🎨","🎭","🎪","🎫","🏆","🚀","🔮","⭐","🔥","✨","🌟",
  "🦄","🤖","👾","🐲","🌈","🍀","🌙","☀️","📀","💾","🗃️","📡",
  "🧙","🐺","🦊","🐙","🍕","☕","🎁","🗝️","🧭","🛸","👑","💀",
];

// Free-type emoji box plus a picker dropdown, shared by Settings' media-type
// icons and Custom Type Builder's icon field, so the user isn't limited to
// typing/pasting or the OS emoji panel.
//
// The text box keeps its own local draft while focused rather than
// committing on every keystroke: a controlled input that writes straight
// through on `onChange` fights the OS emoji picker (Win+.), which can
// insert alongside a selection rather than replacing it, and clearing the
// box would otherwise snap straight back to the old icon the instant it
// goes empty. Committing only on blur/Enter lets the user select, clear,
// paste, or use the OS picker freely. The picker dropdown commits
// immediately on click, same as every other swatch-style picker here.
//
// Anchored with position:fixed off the trigger button's own measured rect,
// same reasoning as TopBar's MoreTypesMenu/ManageTypesMenu — both callers'
// containers scroll, which would otherwise clip a normally-flowed dropdown.
export const IconInput = ({ value, onChange }) => {
  const [local, setLocal] = useState(value);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPos, setPickerPos] = useState(null);
  const btnRef = useRef(null);
  useEffect(() => { setLocal(value); }, [value]);

  const commit = () => {
    const trimmed = local.trim();
    if (trimmed) onChange(trimmed.slice(0, 4));
    else setLocal(value);
  };

  const openPicker = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPickerPos({ top: r.bottom + 4, left: r.left });
    }
    setPickerOpen(true);
  };

  const pick = (emoji) => {
    setLocal(emoji);
    onChange(emoji);
    setPickerOpen(false);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
      <input
        type="text"
        value={local}
        onChange={e => setLocal(e.target.value)}
        onFocus={e => e.target.select()}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
        title="Click, then paste or type any emoji to replace it"
        style={{
          width: 34, height: 34, borderRadius: 6, background: T.surface2,
          border: `1px solid ${T.border}`, textAlign: "center",
          color: T.text, fontSize: 16, outline: "none", boxSizing: "border-box",
          fontFamily: T.fontSans, flexShrink: 0,
        }}
      />
      <button
        ref={btnRef}
        type="button"
        onClick={openPicker}
        title="Choose from a picker"
        style={{
          width: 20, height: 34, borderRadius: 6, background: T.surface2,
          border: `1px solid ${T.border}`, color: T.muted, fontSize: 9,
          cursor: "pointer", flexShrink: 0,
        }}
      >▾</button>
      {pickerOpen && pickerPos && (
        <>
          <div onClick={() => setPickerOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 199 }} />
          <div style={{
            position: "fixed", top: pickerPos.top, left: pickerPos.left,
            background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6,
            padding: 8, width: 224, maxHeight: 220, overflowY: "auto",
            display: "flex", flexWrap: "wrap", gap: 4, zIndex: 200,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}>
            {EMOJI_PICKER_CHOICES.map(emoji => (
              <span
                key={emoji}
                onClick={() => pick(emoji)}
                style={{
                  width: 28, height: 28, borderRadius: 5, background: T.surface2,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 15, cursor: "pointer",
                }}
              >{emoji}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
