// What a screen reader says for a library item: the tile only draws a picture,
// a coloured dot and tiny text, so on its own it would be announced as nothing
// useful. Pure — test/mobileA11y.test.js runs it without Expo.
import { formatRating } from "@media-vault/core/tokens/ratings.js";
import { statusLabel } from "./format";

// "Dune, Book, Completed, your rating +3, 2021".
export function describeItem(item) {
  const parts = [item.title || "Untitled", item.media_type, item.status ? statusLabel(item.status) : null];
  if (item.rating != null) parts.push(`your rating ${formatRating(item.rating)}`);
  if (item.year) parts.push(String(item.year));
  return parts.filter(Boolean).join(", ");
}

// The extra hint a tile gets while multi-selecting.
export const selectHint = (selecting, selected) =>
  selecting ? (selected ? "Selected. Double tap to unselect." : "Double tap to select.") : "Double tap to open. Long press to select.";
