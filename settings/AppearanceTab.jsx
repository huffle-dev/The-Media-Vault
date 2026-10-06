// Settings → Appearance tab: theme mode, accent/status/text colors, font
// pairing, and per-media-type colors/icons. Almost entirely stateless —
// nearly everything here is a controlled callback into App.jsx's
// theme-mutation functions in packages/core/tokens/theme.js.
import { T, ACCENT_SWATCHES, STATUS_COLOR_KEYS, STATUS_COLOR_SWATCHES, TEXT_COLOR_KEYS, TEXT_COLOR_SWATCHES, FONT_PAIRS, THEME_MODES, getThemeMode, MEDIA_TYPES } from "../tokens.js";
import { ColorSwatchPicker, IconInput } from "../components/PickerComponents.jsx";
import { Group, Card, Label, typeDisplayLabel } from "./SettingsShared.jsx";

// Live previews — each reuses the exact styling of the real component, so
// "what does this actually change?" has a concrete answer next to the
// picker. "All" is the one tab that still genuinely follows the accent —
// every other type tab has its own independently-editable color (see Media
// Type Colors & Icons below).
const AccentPreview = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
    <button style={{
      padding: "4px 14px", background: T.accent, color: T.bg, border: "none",
      borderRadius: 5, fontSize: 11, fontWeight: 700, fontFamily: T.fontSans, cursor: "default",
    }}>+ Add to Library</button>
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "4px 10px", background: T.accent + "22", color: T.accent,
      fontSize: 11, fontWeight: 600, borderRadius: 4,
      borderBottom: `2px solid ${T.accent}`, fontFamily: T.fontSans,
    }}>All</span>
  </div>
);

const StatusPillPreview = ({ color, label }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 5, marginBottom: 8,
    padding: "3px 9px 3px 7px", borderRadius: 100, border: `1px solid ${color}44`,
  }}>
    <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block" }} />
    <span style={{ fontFamily: T.fontMono, fontSize: 10.5, color, textTransform: "uppercase", letterSpacing: "0.05em" }}>
      {label}
    </span>
  </span>
);

const TEXT_PREVIEWS = {
  text: () => (
    <div style={{ fontFamily: T.fontSerif, fontSize: 17, color: T.text, marginBottom: 10 }}>
      The Dark Knight
    </div>
  ),
  muted: () => (
    <div style={{
      fontFamily: T.fontMono, fontSize: 10, color: T.muted, marginBottom: 10,
      textTransform: "uppercase", letterSpacing: "0.06em",
    }}>All Genres</div>
  ),
  dim: () => (
    <div style={{ fontFamily: T.fontMono, fontSize: 12, color: T.dim, marginBottom: 10 }}>
      ← Back to Library
    </div>
  ),
};

// Reads T.fontSerif/Sans/Mono directly, so this always reflects whichever
// pair is currently active, with no separate state of its own.
const FontPairPreview = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
    <div style={{ fontFamily: T.fontSerif, fontSize: 20, color: T.text }}>Heading — The Dark Knight</div>
    <div style={{ fontFamily: T.fontSans, fontSize: 13, color: T.text }}>Body — Director, Genre, Year, Runtime</div>
    <div style={{
      fontFamily: T.fontMono, fontSize: 10, color: T.muted,
      textTransform: "uppercase", letterSpacing: "0.06em",
    }}>Mono labels — All Genres · Recently Added</div>
  </div>
);

export default function AppearanceTab({
  onSetAccent, onSetStatusColor, onSetTextColor, onSetFontPair, onSetThemeMode,
  onResetAppearance, onSetTypeStyle, customTypes, onCustomTypesChanged,
}) {
  // Custom types don't go through the built-in mutate-in-place/T-style
  // override system — their icon/color live directly on the custom_types
  // DB row, so this reuses CustomTypeBuilder's own update() call for one
  // field at a time. It replaces label/fields wholesale, so both are sent
  // back unchanged alongside whichever field changed.
  const handleSetCustomTypeStyle = async (type, patch) => {
    await window.vault.customTypes.update(type.id, {
      label: type.label, fields: type.fields,
      icon: type.icon, color: type.color, ...patch,
    });
    if (onCustomTypesChanged) onCustomTypesChanged();
  };

  const pillStyle = (active) => ({
    padding: "7px 16px",
    border: `1px solid ${active ? T.accent : T.border}`,
    borderRadius: 100, cursor: "pointer",
    background: active ? T.accent + "22" : "transparent",
    color: active ? T.accent : T.muted,
    fontSize: 12, fontFamily: T.fontSans,
    fontWeight: active ? 600 : 400,
  });

  const resetButton = (
    <button
      onClick={onResetAppearance}
      style={{
        padding: "4px 12px", background: "transparent",
        border: `1px solid ${T.border}`, borderRadius: 5,
        color: T.muted, fontSize: 11, cursor: "pointer", fontFamily: T.fontSans,
      }}
    >↺ Reset all</button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Group title="Look & feel">
        <Card title="Theme" blurb="Light or dark." aside={resetButton}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {THEME_MODES.map(mode => (
              <button key={mode.id} onClick={() => onSetThemeMode(mode.id)} style={pillStyle(getThemeMode() === mode.id)}>
                {mode.label}
              </button>
            ))}
          </div>
        </Card>

        <Card title="Accent color" blurb="Used for buttons, highlights and the All tab.">
          <AccentPreview />
          <ColorSwatchPicker current={T.accent} swatches={ACCENT_SWATCHES} onPick={onSetAccent} />
        </Card>

        <Card title="Fonts" blurb="The typeface pairing used across the app.">
          <FontPairPreview />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {FONT_PAIRS.map(pair => (
              <button key={pair.id} onClick={() => onSetFontPair(pair.id)} style={pillStyle(T.fontSans === pair.sans)}>
                {pair.label}
              </button>
            ))}
          </div>
        </Card>
      </Group>

      <Group title="Colors">
        <Card title="Status colors" blurb="How each status (Wishlist, In Progress, and so on) is colored.">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {STATUS_COLOR_KEYS.map(({ key, label }) => (
              <div key={key}>
                <StatusPillPreview color={T[key]} label={label} />
                <ColorSwatchPicker current={T[key]} swatches={STATUS_COLOR_SWATCHES} onPick={color => onSetStatusColor(key, color)} />
              </div>
            ))}
          </div>
        </Card>

        <Card title="Text colors" blurb="Main text, secondary labels and links.">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {TEXT_COLOR_KEYS.map(({ key, label }) => {
              const Preview = TEXT_PREVIEWS[key];
              return (
                <div key={key}>
                  <Label>{label}</Label>
                  {Preview && <Preview />}
                  <ColorSwatchPicker current={T[key]} swatches={TEXT_COLOR_SWATCHES} onPick={color => onSetTextColor(key, color)} />
                </div>
              );
            })}
          </div>
        </Card>
      </Group>

      <Group title="Media types">
        <Card title="Colors & icons" blurb="The icon and color shown for each type of media.">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {MEDIA_TYPES.map(mt => (
              <div key={mt.label}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <IconInput value={mt.icon} onChange={icon => onSetTypeStyle(mt.label, { icon })} />
                  <span style={{ fontSize: 12, color: T.text, fontFamily: T.fontSans }}>{typeDisplayLabel(mt.label)}</span>
                </div>
                <ColorSwatchPicker current={mt.color} swatches={ACCENT_SWATCHES} onPick={color => onSetTypeStyle(mt.label, { color })} />
              </div>
            ))}
            {(customTypes || []).map(ct => (
              <div key={`custom-${ct.id}`}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <IconInput value={ct.icon} onChange={icon => handleSetCustomTypeStyle(ct, { icon })} />
                  <span style={{ fontSize: 12, color: T.text, fontFamily: T.fontSans }}>{ct.label}</span>
                </div>
                <ColorSwatchPicker current={ct.color} swatches={ACCENT_SWATCHES} onPick={color => handleSetCustomTypeStyle(ct, { color })} />
              </div>
            ))}
          </div>
        </Card>
      </Group>
    </div>
  );
}
