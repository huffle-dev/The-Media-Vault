// Appearance — accent color, per-status colors, text colors, font pairing,
// theme mode, per-media-type colors/icons. Passed down as props to
// SettingsModal's Appearance tab only.
//
// T is mutated in place (applyThemeOverrides/applyFontPair, see
// packages/core/tokens/theme.js) rather than threaded through props, since ~250 call
// sites already read T.* directly — subscribing here and bumping a tick
// state is what makes those mutations trigger a re-render.
import { useState, useEffect } from "react";
import {
  T, MEDIA_TYPES, STATUS_COLOR_KEYS, TEXT_COLOR_KEYS,
  subscribeTheme, applyThemeOverrides, applyFontPair, applyThemeMode,
  resetAppearance, applyTypeStyleOverrides, resetTypeStyles,
} from "../tokens.js";

export function useAppearanceSettings() {
  const [, setThemeTick] = useState(0);
  useEffect(() => subscribeTheme(() => setThemeTick(t => t + 1)), []);

  const loadAppearance = () => {
    Promise.all([
      window.vault.settings.get("appearance_accent"),
      window.vault.settings.get("appearance_status_colors"),
      window.vault.settings.get("appearance_text_colors"),
      window.vault.settings.get("appearance_font_pair"),
      window.vault.settings.get("appearance_theme_mode"),
      window.vault.settings.get("appearance_type_styles"),
    ]).then(([accent, statusColors, textColors, fontPair, themeMode, typeStyles]) => {
      if (themeMode) applyThemeMode(themeMode);
      const overrides = {};
      if (accent) overrides.accent = accent;
      if (statusColors) {
        try { Object.assign(overrides, JSON.parse(statusColors)); } catch {}
      }
      if (textColors) {
        try { Object.assign(overrides, JSON.parse(textColors)); } catch {}
      }
      if (Object.keys(overrides).length) applyThemeOverrides(overrides);
      if (fontPair) applyFontPair(fontPair);
      if (typeStyles) {
        try { applyTypeStyleOverrides(JSON.parse(typeStyles)); } catch {}
      }
    });
  };

  const handleSetAccent = (hex) => {
    applyThemeOverrides({ accent: hex });
    window.vault.settings.set("appearance_accent", hex);
  };

  const handleSetStatusColor = (key, hex) => {
    applyThemeOverrides({ [key]: hex });
    window.vault.settings.set("appearance_status_colors", JSON.stringify(
      Object.fromEntries(STATUS_COLOR_KEYS.map(s => [s.key, T[s.key]]))
    ));
  };

  const handleSetTextColor = (key, hex) => {
    applyThemeOverrides({ [key]: hex });
    window.vault.settings.set("appearance_text_colors", JSON.stringify(
      Object.fromEntries(TEXT_COLOR_KEYS.map(s => [s.key, T[s.key]]))
    ));
  };

  const handleSetFontPair = (pairId) => {
    applyFontPair(pairId);
    window.vault.settings.set("appearance_font_pair", pairId);
  };

  // Persists the full current color/icon state of every built-in type (not
  // just the one that changed) — same pattern as status/text colors above,
  // reading back from MEDIA_TYPES itself since applyTypeStyleOverrides
  // already mutated it in place.
  const handleSetTypeStyle = (mediaType, patch) => {
    applyTypeStyleOverrides({ [mediaType]: patch });
    window.vault.settings.set("appearance_type_styles", JSON.stringify(
      Object.fromEntries(MEDIA_TYPES.map(mt => [mt.label, { color: mt.color, icon: mt.icon }]))
    ));
  };

  // Mode switch reassigns the whole bg/border/text palette (see
  // applyThemeMode), which would silently wipe out a custom text color —
  // re-fetch and re-apply it immediately after so it survives the switch.
  const handleSetThemeMode = async (mode) => {
    applyThemeMode(mode);
    window.vault.settings.set("appearance_theme_mode", mode);
    const textColors = await window.vault.settings.get("appearance_text_colors");
    if (textColors) {
      try { applyThemeOverrides(JSON.parse(textColors)); } catch {}
    }
  };

  // Leaves the dark/light mode choice alone — only clears the
  // customizations layered on top of it.
  const handleResetAppearance = () => {
    resetAppearance();
    resetTypeStyles();
    window.vault.settings.set("appearance_accent", "");
    window.vault.settings.set("appearance_status_colors", "");
    window.vault.settings.set("appearance_text_colors", "");
    window.vault.settings.set("appearance_font_pair", "");
    window.vault.settings.set("appearance_type_styles", "");
  };

  return {
    loadAppearance,
    handleSetAccent, handleSetStatusColor, handleSetTextColor,
    handleSetFontPair, handleSetTypeStyle, handleSetThemeMode,
    handleResetAppearance,
  };
}
