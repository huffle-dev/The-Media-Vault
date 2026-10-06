// Theme/appearance tokens — palettes, accent/status/text colors, fonts, and
// the light/dark mode switch. Split out of the old monolithic tokens.js
// (see mediaTypes.js for the sibling piece that shares this file's
// notify-on-change mechanism).

// Light/dark palettes — everything that's genuinely theme-dependent
// (backgrounds, borders, text, and the handful of hover/row-stripe tints
// that used to be hardcoded assuming a dark background). Accent, status
// colors, and fonts are NOT in here — those are user customizations
// independent of light/dark mode, so switching modes doesn't reset them.
const DARK_PALETTE = {
  bg:       "#09090e",
  surface:  "#111118",
  surface2: "#18181f",
  topbar:   "#070710",
  border:   "#1e1e2a",
  text:     "#ffffff",
  muted:    "#c7c7d8",
  dim:      "#c7c7d8",
  rowAlt:          "#0c0c14",   // alternating list-row background
  hoverWash:       "#ffffff08", // subtle hover tint over a dark surface
  hoverWashStrong: "#ffffff12", // stronger hover tint (e.g. active drag target)
  hoverSurface:    "#1e1e2a",   // opaque hover fill (e.g. import tile hover)
  accentWash:      "#1a0f00",   // low-key accent-tinted banner (selection bar)
};

const LIGHT_PALETTE = {
  bg:       "#f6f6f9",
  surface:  "#ffffff",
  surface2: "#eef0f4",
  topbar:   "#ffffff",
  border:   "#e3e5ea",
  text:     "#1c1c26",
  muted:    "#8b8b9c",
  dim:      "#5a5a6c",
  rowAlt:          "#f1f2f6",
  hoverWash:       "#00000008",
  hoverWashStrong: "#00000014",
  hoverSurface:    "#e9e9ef",
  accentWash:      "#fdf3dd",
};

export const T = {
  ...DARK_PALETTE,

  // Brand
  accent:   "#e3aa26",

  // Status colours
  seen:       "#4bb851",   // Consumed
  blue:       "#5b8ff5",   // Wishlist
  notStarted: "#1cd9b3",   // Not Started — owned but not begun; deliberately muted/neutral, distinct from Wishlist's blue
  purple:     "#b06ef0",   // Local / Owned
  progress:   "#f59e0b",   // In Progress (Phase 5)
  dropped:    "#e5384a",   // Dropped

  // Fonts — referenced everywhere as T.fontSans/T.fontMono/T.fontSerif
  // rather than the literal Google Fonts strings, so Appearance settings
  // can swap the whole app's typeface pairing by mutating these three
  // values instead of touching every component.
  fontSans:   "'DM Sans', sans-serif",
  fontMono:   "'DM Mono', monospace",
  fontSerif:  "'DM Serif Display', serif",
};

// ── Appearance ───────────────────────────────────────────────────────────
// T is a plain object every component reads directly (T.accent, T.fontSans,
// ...) at render time, not through props or context — so React still needs
// a reason to re-render already-mounted components. applyThemeOverrides()
// mutates T in place and notifies every subscriber (App.jsx subscribes once
// at the root and bumps a counter state) rather than rewriting ~250 call
// sites to consume a context.
//
// Shared with mediaTypes.js's applyTypeStyleOverrides, which mutates
// MEDIA_TYPES/TYPE_TABS in place the same way — notifyThemeListeners is
// exported so it can notify the same listener set.
const themeListeners = new Set();
export const subscribeTheme = (fn) => {
  themeListeners.add(fn);
  return () => themeListeners.delete(fn);
};
export const notifyThemeListeners = () => {
  themeListeners.forEach(fn => fn());
};
export const applyThemeOverrides = (overrides) => {
  Object.assign(T, overrides);
  notifyThemeListeners();
};

// Curated accent swatches — not a free-form picker by default, though
// CUSTOM_COLOR_PATTERN below still allows any hex if none of these fit.
export const ACCENT_SWATCHES = [
  "#e8b84b", "#5b8ff5", "#4be8c8", "#f472b6", "#a78bfa", "#e84b4b", "#4ade80", "#94a3b8",
];

export const STATUS_COLOR_KEYS = [
  { key: "blue",       label: "Wishlist" },
  { key: "notStarted", label: "Not Started" },
  { key: "progress",   label: "In Progress" },
  { key: "seen",       label: "Consumed" },
  { key: "dropped",    label: "Dropped" },
];

export const STATUS_COLOR_SWATCHES = [
  "#5b8ff5", "#f59e0b", "#4bb87a", "#e84b6e", "#a78bfa", "#4be8c8", "#f472b6", "#e8b84b",
];

// Text is the one part of the palette that's both theme-dependent (dark vs
// light need different defaults to stay readable) AND user-overridable —
// unlike accent/status, a custom text color would otherwise get silently
// clobbered every time the mode switches. See applyThemeMode/App.jsx's
// handleSetThemeMode for how a saved override gets re-applied after a
// mode switch instead of lost.
export const TEXT_COLOR_KEYS = [
  { key: "text",  label: "Primary Text" },
  { key: "muted", label: "Muted Text" },
  { key: "dim",   label: "Dim Text" },
];

export const TEXT_COLOR_SWATCHES = [
  "#ffffff", "#ddddf0", "#c7c7d8", "#8b8b9c", "#5a5a6c", "#1c1c26", "#f4e9d0", "#a9c4e8",
];

export const CUSTOM_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

// Each pair swaps the same 3 roles (serif display headings, sans body, mono
// labels/data) the app already uses — not arbitrary fonts, so layout
// metrics already tuned for DM's don't break. googleFamilies is what gets
// fetched from Google Fonts; sans/mono/serif are the T.font* values applied
// afterward.
export const FONT_PAIRS = [
  {
    id: "classic", label: "Classic (default)",
    sans: "'DM Sans', sans-serif", mono: "'DM Mono', monospace", serif: "'DM Serif Display', serif",
    googleFamilies: [],
  },
  {
    id: "modern", label: "Modern",
    sans: "'Inter', sans-serif", mono: "'IBM Plex Mono', monospace", serif: "'Fraunces', serif",
    googleFamilies: ["Inter:wght@400;500;600;700", "IBM+Plex+Mono:wght@400;500;600", "Fraunces:wght@400;500"],
  },
  {
    id: "warm", label: "Warm",
    sans: "'Source Sans 3', sans-serif", mono: "'Space Mono', monospace", serif: "'Lora', serif",
    googleFamilies: ["Source+Sans+3:wght@400;500;600;700", "Space+Mono:wght@400;700", "Lora:wght@400;500"],
  },
  {
    id: "minimal", label: "Minimal",
    sans: "'Work Sans', sans-serif", mono: "'JetBrains Mono', monospace", serif: "'Libre Baskerville', serif",
    googleFamilies: ["Work+Sans:wght@400;500;600;700", "JetBrains+Mono:wght@400;500;600", "Libre+Baskerville:wght@400;700"],
  },
];

// Loads a font pair's Google Fonts (no-op for "classic", already loaded by
// index.html) and applies its 3 roles via applyThemeOverrides. Idempotent —
// <link> tags are keyed by id and Google Fonts itself no-ops a repeat request.
export const applyFontPair = (pairId) => {
  const pair = FONT_PAIRS.find(p => p.id === pairId) || FONT_PAIRS[0];
  if (pair.googleFamilies.length) {
    const linkId = `font-pair-${pair.id}`;
    if (!document.getElementById(linkId)) {
      const link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?${pair.googleFamilies.map(f => `family=${f}`).join("&")}&display=swap`;
      document.head.appendChild(link);
    }
  }
  applyThemeOverrides({ fontSans: pair.sans, fontMono: pair.mono, fontSerif: pair.serif });
};

export const THEME_MODES = [
  { id: "dark",  label: "Dark" },
  { id: "light", label: "Light" },
];

let currentThemeMode = "dark";
export const getThemeMode = () => currentThemeMode;

// Swaps every background/border/text/hover token between the dark and light
// palettes. Leaves accent, status colors, and fonts alone — independent
// user customizations, not part of the light/dark split. Also pushes
// bg/text onto <body> directly, since index.html's base CSS hardcodes the
// dark values for the very first paint, before React even mounts.
export const applyThemeMode = (mode) => {
  currentThemeMode = mode === "light" ? "light" : "dark";
  const palette = currentThemeMode === "light" ? LIGHT_PALETTE : DARK_PALETTE;
  applyThemeOverrides(palette);
  if (typeof document !== "undefined" && document.body) {
    document.body.style.background = palette.bg;
    document.body.style.color = palette.text;
  }
};

export const DEFAULT_ACCENT = "#e3aa26";
// notStarted was missing here even though it's a real customizable status
// color (STATUS_COLOR_KEYS includes it) — a real pre-existing bug: "Reset
// to Defaults" never touched it, silently leaving whatever was last
// customized. Fixed by including it.
export const DEFAULT_STATUS_COLORS = { blue: "#5b8ff5", notStarted: "#1cd9b3", progress: "#f59e0b", seen: "#4bb851", dropped: "#e5384a" };

// Resets accent, status colors, text colors, and font pairing to default —
// leaves the light/dark mode choice alone, a separate, more fundamental
// preference. Text colors reset to the CURRENT mode's own defaults, since
// "default" for text means "whatever this theme normally is".
export const resetAppearance = () => {
  const palette = currentThemeMode === "light" ? LIGHT_PALETTE : DARK_PALETTE;
  applyThemeOverrides({
    accent: DEFAULT_ACCENT,
    ...DEFAULT_STATUS_COLORS,
    text: palette.text, muted: palette.muted, dim: palette.dim,
  });
  applyFontPair("classic");
};
