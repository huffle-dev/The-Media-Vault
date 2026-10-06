// Scan a photo of a shelf (desktop's Import -> Scan Photo): Gemini lists what it can read
// on the spines and boxes, you tick the ones that are right and add them. The request
// itself is the shared packages/core/gemini.js; this is the shaping of its answer into
// rows to review. Pure — test/mobilePhotoScan.test.js runs it without Expo.
import { cleanScanItems, SCAN_TYPES } from "@media-vault/core/gemini.js";
import { findDuplicate } from "./duplicates";

export { SCAN_TYPES };

// Review rows: every titled thing it found, ticked, flagged if already in the library.
export function reviewRows(found, library) {
  return cleanScanItems(found).map((it, i) => ({
    id: `row-${i}`, title: it.title, media_type: it.media_type, confidence: it.confidence, note: it.note,
    duplicate: !!findDuplicate(library, { title: it.title, media_type: it.media_type }),
    // Ticked unless it looks like a repeat; a low-confidence guess is ticked too but marked so.
    selected: !findDuplicate(library, { title: it.title, media_type: it.media_type }),
  }));
}

// What to add: the ticked rows with a non-empty title. A photo of your own shelf means
// you own it, so they go in as Not Started and marked owned (desktop's rule: owned + Wishlist
// becomes Not Started).
export function rowsToAdd(rows) {
  return rows
    .filter((r) => r.selected && r.title.trim())
    .map((r) => ({ mediaType: r.media_type, title: r.title.trim(), quickRow: { title: r.title.trim(), status: "not-started" } }));
}

export const confidenceLabel = (c) => (c === "high" ? "sure" : c === "low" ? "unsure" : "probably");
