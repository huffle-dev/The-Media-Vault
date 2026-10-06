// Carrying the desktop's Appearance choices (accent colour, status colours, and
// each type's colour and icon) to the phone. Desktop writes ONE row to the
// user's own Supabase `app_settings` table (key "appearance"); the phone reads
// it and recolours itself. One-way on purpose: the phone has no Appearance
// screen, and the desktop is the only place these are edited.
//
// Pure and defensive — the payload comes from a server, so every colour is
// checked as a hex colour and every icon as a short string before it is used.

const APPEARANCE_KEY = "appearance";

const HEX = /^#[0-9a-fA-F]{6}$/;
const STATUS_KEYS = ["blue", "notStarted", "progress", "seen", "dropped"];

const parseJson = (text) => {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
};

// From the desktop's saved settings (strings) to the object that gets uploaded.
// Returns null when nothing has been customised (so nothing needs uploading).
function buildAppearancePayload(getSetting) {
  const accent = getSetting("appearance_accent");
  const status = parseJson(getSetting("appearance_status_colors"));
  const types = parseJson(getSetting("appearance_type_styles"));
  const payload = {};
  if (accent) payload.accent = accent;
  if (status) payload.statusColors = status;
  if (types) payload.typeStyles = types;
  return Object.keys(payload).length ? payload : null;
}

// Keeps only values that are safe to apply.
function cleanAppearancePayload(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  if (HEX.test(raw.accent || "")) out.accent = raw.accent;
  if (raw.statusColors && typeof raw.statusColors === "object") {
    const colors = {};
    for (const k of STATUS_KEYS) if (HEX.test(raw.statusColors[k] || "")) colors[k] = raw.statusColors[k];
    if (Object.keys(colors).length) out.statusColors = colors;
  }
  if (raw.typeStyles && typeof raw.typeStyles === "object") {
    const styles = {};
    for (const [type, s] of Object.entries(raw.typeStyles)) {
      if (!s || typeof s !== "object") continue;
      const one = {};
      if (HEX.test(s.color || "")) one.color = s.color;
      if (typeof s.icon === "string" && s.icon.length > 0 && s.icon.length <= 8) one.icon = s.icon;
      if (Object.keys(one).length) styles[type] = one;
    }
    if (Object.keys(styles).length) out.typeStyles = styles;
  }
  return out;
}

module.exports = { APPEARANCE_KEY, buildAppearancePayload, cleanAppearancePayload };
