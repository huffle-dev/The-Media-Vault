// Where to Watch on the phone. The desktop stores every country's providers for
// a title in one synced column (watch_providers: { GB: { flatrate, rent, buy,
// free, link } }), so the phone only needs to know which country you are in.
// Pure — test/mobileWatchData.test.js runs it without Expo.
import { watchProvidersForRegion, watchLinkForRegion } from "@media-vault/core/tokens/itemHelpers.js";

const LABELS = { flatrate: "Stream", free: "Free", rent: "Rent", buy: "Buy" };

// [{ type, label, providers: [names] }] for the chosen country, empty groups left out.
export function watchBuckets(item, region) {
  return ["flatrate", "free", "rent", "buy"]
    .map((type) => ({ type, label: LABELS[type], providers: watchProvidersForRegion(item, region, type) }))
    .filter((b) => b.providers.length > 0);
}

export const watchLink = (item, region) => watchLinkForRegion(item, region);

// Whether this title has ever been checked (so "no providers" can be told apart
// from "never looked").
export const watchChecked = (item) => item.watch_checked_date != null;

// "en-GB" -> "GB" when that country is one TMDB has data for, else the fallback.
export function guessRegion(locale, available, fallback = "US") {
  const m = /[-_]([A-Za-z]{2})\b/.exec(String(locale || ""));
  const code = m ? m[1].toUpperCase() : null;
  if (code && (!available || available.includes(code))) return code;
  return fallback;
}

// Countries to pick from: the full TMDB list when the phone can name them,
// otherwise just the codes (Intl.DisplayNames may be missing on some phones).
export function regionChoices(getOptions, fallbackCodes = []) {
  try {
    const options = getOptions();
    if (Array.isArray(options) && options.length) return options;
  } catch { /* fall through */ }
  return fallbackCodes.map((code) => ({ code, name: code }));
}

// The country remembered on this phone (Where to Watch card and the stream filter share it).
const REGION_KEY = "mobile_watch_region";
export function savedRegion(available, store = typeof localStorage !== "undefined" ? localStorage : null) {
  try {
    const saved = store && store.getItem(REGION_KEY);
    if (saved) return saved;
  } catch { /* fall through to the guess */ }
  let locale = "en-US";
  try { locale = Intl.DateTimeFormat().resolvedOptions().locale; } catch { /* default */ }
  return guessRegion(locale, available);
}
export function saveRegion(code, store = typeof localStorage !== "undefined" ? localStorage : null) {
  try { if (store) store.setItem(REGION_KEY, code); } catch { /* best-effort */ }
}
