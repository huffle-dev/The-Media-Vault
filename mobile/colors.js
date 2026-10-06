// The phone's palette IS the desktop's default dark theme — read straight
// from the shared theme tokens (packages/core/tokens/theme.js) rather than
// copied, so the two can't drift. (Desktop users can recolour their own
// copy in Appearance; that's per-device and doesn't sync, so the phone uses
// the defaults.)
import { T } from "@media-vault/core/tokens/theme.js";
import { DEFAULT_STATUS_COLORS } from "@media-vault/core/tokens/theme.js";

export const C = {
  bg: T.bg,
  surface: T.surface,
  surface2: T.surface2,
  topbar: T.topbar,
  border: T.border,
  text: T.text,
  textSoft: T.muted,
  muted: T.muted,
  dim: T.dim,
  accent: T.accent,
  danger: T.dropped,
  seen: T.seen,
  blue: T.blue,
  notStarted: T.notStarted,
  progress: T.progress,
  purple: T.purple,
  hoverWashStrong: T.hoverWashStrong,
};

// The desktop's three typefaces (DM Sans / DM Mono / DM Serif Display),
// loaded in the root layout. Weighted DM Sans variants are separate font
// files on a phone, which is why Text.js maps fontWeight to them.
export const F = {
  sans: "DMSans_400Regular",
  sansMedium: "DMSans_500Medium",
  sansSemi: "DMSans_600SemiBold",
  sansBold: "DMSans_700Bold",
  mono: "DMMono_400Regular",
  monoMedium: "DMMono_500Medium",
  serif: "DMSerifDisplay_400Regular",
};

// Status -> its colour (desktop's PosterCard STATUS_COLOR_MAP).
const STATUS_COLOR_KEY = {
  wishlist: "blue", "not-started": "notStarted", "in-progress": "progress",
  consumed: "seen", dropped: "dropped",
};
export const statusColor = (status) => DEFAULT_STATUS_COLORS[STATUS_COLOR_KEY[status]] || DEFAULT_STATUS_COLORS.blue;
