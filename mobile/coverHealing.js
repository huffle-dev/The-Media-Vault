// When a tile or profile cannot draw a cover it was given (the saved file is damaged or is not really a
// picture), delete that file, forget it was "found", and let the picture be fetched again: once per link
// per run, so a link that is truly bad does not loop. Each case goes in the problems log.
import { diag } from "./diag";
import { coverFileNameForUrl, deleteCoverFiles } from "./coverArtStorage";

const listeners = new Set();
const tried = new Set();

export const onCoverHealed = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function reportCoverError(item) {
  const url = item && item.cover_art_url;
  if (!url) return;
  const again = !tried.has(url);
  diag.add("warn", "cover", `${item.title || "An item"} (${item.media_type}): the saved cover would not draw${again ? ", fetching it again" : ""}`, url);
  if (!again) return;
  tried.add(url);
  try { deleteCoverFiles([coverFileNameForUrl(url)]); } catch { /* nothing to delete */ }
  listeners.forEach((fn) => fn(url));
}
