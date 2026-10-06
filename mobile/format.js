// Small display helpers shared by the mobile screens.

// "not-started" -> "Not Started" — desktop's STATUS_WHEEL_ORDER values are
// stored exactly like this; no shared display helper exists for it yet in
// @media-vault/core (worth promoting there if a third consumer needs it).
export function statusLabel(status) {
  return (status || "").split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export { timeAgo } from "@media-vault/core/tokens/timeAgo.js";
