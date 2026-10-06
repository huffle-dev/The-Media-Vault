// HowLongToBeat (unofficial — no public API exists) integration. HLTB
// doesn't publish an API, so this reads the search endpoint out of its own
// Next.js bundle at request time (the path changes periodically): home page
// -> app bundle -> regex the POST endpoint -> auth challenge -> search.
// Entirely read-only public data, no login involved.

const { fetchWithTimeout: fetch } = require("@media-vault/core/fetchWithTimeout");

const HLTB_BASE_URL = "https://howlongtobeat.com/";
const HLTB_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const HLTB_SEARCH_URL_FALLBACK = "/api/s";

async function hltbDiscoverSearchUrl() {
  const homeResp = await fetch(HLTB_BASE_URL, { headers: { "User-Agent": HLTB_USER_AGENT } });
  const homeHtml = await homeResp.text();
  // HLTB no longer names its main bundle "_app-<hash>.js" — scanning every
  // /_next/static/ script instead is more resilient to naming changes.
  const scriptSrcs = [...homeHtml.matchAll(/<script[^>]+src="([^"]+)"/g)]
    .map(m => m[1])
    .filter(src => src.includes("/_next/static/"));

  for (const src of scriptSrcs) {
    const scriptUrl = src.startsWith("http") ? src : HLTB_BASE_URL.replace(/\/$/, "") + src;
    let scriptText;
    try {
      const scriptResp = await fetch(scriptUrl, { headers: { "User-Agent": HLTB_USER_AGENT } });
      scriptText = await scriptResp.text();
    } catch { continue; }
    // Confirms method: POST to filter out the unrelated GET "init" call.
    const match = scriptText.match(/fetch\s*\(\s*["']\/api\/([a-zA-Z0-9_/]+)[^"']*["']\s*,\s*\{[^}]*method:\s*["']POST["'][^}]*\}/is);
    // The real endpoint moved from a single-segment path to a nested one
    // (/api/search -> /api/search/site) — this used to truncate to just the
    // first segment (match[1].split("/")[0]), which is exactly what broke:
    // discovery resolved to /api/search, silently dropping "/site", so
    // every search 404'd. Use the full captured path instead.
    if (match) return `/api/${match[1]}`;
  }
  return null;
}

// The challenge token's field names vary, so this matches by shape
// ("...key", "...val") rather than a hardcoded name.
async function hltbGetAuthToken(searchUrl) {
  const initUrl = `${HLTB_BASE_URL}${searchUrl.replace(/^\//, "")}/init?t=${Date.now()}`;
  const resp = await fetch(initUrl, { headers: { "User-Agent": HLTB_USER_AGENT, Referer: HLTB_BASE_URL } });
  if (!resp.ok) return null;
  const data = await resp.json();
  let authKey = null, authValue;
  for (const [fieldName, fieldValue] of Object.entries(data)) {
    const lower = fieldName.toLowerCase();
    if (lower.includes("key")) authKey = fieldValue;
    else if (lower.includes("val")) authValue = fieldValue;
  }
  return { token: data.token, authKey, authValue };
}

// Resolved once per hltb:enrich run, reused across the whole batch.
async function hltbGetContext() {
  let searchUrl = null;
  try {
    searchUrl = await hltbDiscoverSearchUrl();
  } catch { /* fall through to the static fallback below */ }
  if (!searchUrl) searchUrl = HLTB_SEARCH_URL_FALLBACK;
  const auth = await hltbGetAuthToken(searchUrl).catch(() => null);
  return { searchUrl, auth };
}

// Trusts HLTB's own top-ranked result rather than scoring similarity locally.
async function hltbSearchGame(title, context) {
  const { searchUrl, auth } = context || {};
  const url = `${HLTB_BASE_URL}${(searchUrl || HLTB_SEARCH_URL_FALLBACK).replace(/^\//, "")}/`;
  const headers = {
    "content-type": "application/json",
    "accept": "*/*",
    "User-Agent": HLTB_USER_AGENT,
    "Referer": HLTB_BASE_URL,
    "Origin": HLTB_BASE_URL.slice(0, -1),
  };
  if (auth?.token) headers["x-auth-token"] = String(auth.token);
  if (auth?.authKey) headers["x-hp-key"] = String(auth.authKey);
  if (auth?.authValue !== undefined && auth?.authValue !== null) headers["x-hp-val"] = String(auth.authValue);

  // Steam titles carry trademark symbols glued onto words ("DARK SOULS™
  // III") that break the match — HLTB listings never have them.
  const cleanTitle = title.replace(/[™®©]/g, "").replace(/\s+/g, " ").trim();

  const body = {
    searchType: "games",
    searchTerms: cleanTitle.split(/\s+/).filter(Boolean),
    searchPage: 1,
    size: 20,
    searchOptions: {
      games: {
        userId: 0, platform: "", sortCategory: "popular",
        rangeCategory: "main", rangeTime: { min: 0, max: 0 },
        gameplay: { perspective: "", flow: "", genre: "", difficulty: "" },
        rangeYear: { max: "", min: "" }, modifier: "",
      },
      users: { sortCategory: "postcount" },
      lists: { sortCategory: "follows" },
      filter: "", sort: 0, randomizer: 0,
    },
    useCache: true,
  };
  // The auth key/value pair must also be echoed as a dynamic field in the body.
  if (auth?.authKey && auth?.authValue !== undefined) body[auth.authKey] = auth.authValue;

  const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  // Thrown (not null) so the caller can tell "request failed" apart from
  // "no match" — a non-200 usually means the auth challenge expired mid-batch.
  if (!resp.ok) {
    const err = new Error(`HLTB search request failed (${resp.status})`);
    err.hltbStatus = resp.status;
    throw err;
  }
  const json = await resp.json();
  const first = json?.data?.[0];
  if (!first) return null;

  const toHours = (secs) => (typeof secs === "number" && secs > 0) ? Math.round((secs / 3600) * 10) / 10 : null;
  return {
    hltb_main:          toHours(first.comp_main),
    hltb_main_extra:    toHours(first.comp_plus),
    hltb_completionist: toHours(first.comp_100),
  };
}

module.exports = { hltbGetContext, hltbSearchGame };
