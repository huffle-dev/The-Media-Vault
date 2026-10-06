// Shape checks for what the GOG login flow hands back — an OAuth code
// scraped from a login window, token responses, profile fields, ID lists — so
// a malformed or unexpected value fails closed with a clear error instead of
// being stored or interpolated into a URL. Deliberately loose (correct shape,
// not exact format) so a legitimate provider change doesn't lock anyone out.

// OAuth codes are URL-safe strings (GOG: alphanumeric).
function isPlausibleAuthCode(v) {
  return typeof v === "string" && /^[A-Za-z0-9._~+\/=-]{8,512}$/.test(v);
}

// Access/refresh tokens: a single non-whitespace, non-control string.
function isPlausibleToken(v) {
  return typeof v === "string" && v.length >= 8 && v.length <= 4096 && /^[^\s\x00-\x1f\x7f]+$/.test(v);
}

// The login window's `?code=` param. decodeURIComponent throws on malformed
// percent-escapes — that must read as "no code here", not crash the handler.
function extractGogCode(url) {
  const match = String(url || "").match(/[?&]code=([^&#]+)/);
  if (!match) return null;
  let code;
  try { code = decodeURIComponent(match[1]); } catch { return null; }
  return isPlausibleAuthCode(code) ? code : null;
}

// Display name shown in the UI — a string, or nothing.
function cleanUsername(v) {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, 100);
  return t || null;
}

// Product IDs get interpolated into request URLs, so only digits pass.
function cleanNumericIds(v) {
  if (!Array.isArray(v)) return [];
  return v.filter(id => (typeof id === "number" && Number.isInteger(id) && id > 0) || (typeof id === "string" && /^\d{1,20}$/.test(id)));
}

module.exports = { isPlausibleAuthCode, isPlausibleToken, extractGogCode, cleanUsername, cleanNumericIds };
