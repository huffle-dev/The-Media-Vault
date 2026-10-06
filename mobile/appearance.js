// Pulls the desktop's Appearance choices (see packages/core/appearanceSync.js)
// and applies them to the phone's shared colour objects in place. Best effort:
// no table yet, offline, or nothing customised all just leave the defaults.
import { supabase } from "./supabase";
import { T, DEFAULT_STATUS_COLORS } from "@media-vault/core/tokens/theme.js";
import { applyTypeStyleOverrides } from "@media-vault/core/tokens/mediaTypes.js";
import { APPEARANCE_KEY, cleanAppearancePayload } from "@media-vault/core/appearanceSync.js";
import { C } from "./colors";

// Phone colour names (colors.js) for each desktop status key.
const C_NAME = { blue: "blue", notStarted: "notStarted", progress: "progress", seen: "seen", dropped: "danger" };

export function applyAppearance(raw) {
  const p = cleanAppearancePayload(raw);
  if (p.accent) { T.accent = p.accent; C.accent = p.accent; }
  if (p.statusColors) {
    for (const [k, hex] of Object.entries(p.statusColors)) {
      DEFAULT_STATUS_COLORS[k] = hex;
      T[k] = hex;
      C[C_NAME[k]] = hex;
    }
  }
  if (p.typeStyles) applyTypeStyleOverrides(p.typeStyles);
  return Object.keys(p).length > 0;
}

// Resolves true when something was applied (so the caller can re-render).
export async function syncAppearance() {
  try {
    const { data, error } = await supabase.from("app_settings").select("value").eq("key", APPEARANCE_KEY).maybeSingle();
    if (error || !data) return false;
    return applyAppearance(typeof data.value === "string" ? JSON.parse(data.value) : data.value);
  } catch {
    return false;
  }
}
