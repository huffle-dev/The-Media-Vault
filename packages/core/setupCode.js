// The "setup code": the two values a second device needs to find the person's own Supabase
// project (its address and its PUBLISHABLE key) packed into one piece of text, so the phone
// can scan a QR code or take a paste instead of typing two long strings.
//
//   mediavault://setup?u=<project address>&k=<publishable key>
//
// Nothing secret is in it — the publishable key is designed to be public and what it can
// reach is limited by row-level security — but it names the person's project, so it is shown
// as a code to scan, not published. A secret (service_role) key is refused both ways.
const { normalizeSupabaseUrl, validateSupabaseKey } = require("./supabaseSetup");

const PREFIX = "mediavault://setup";

// -> the code text. Throws a readable Error if the address or key isn't usable.
function encodeSetupCode({ url, key }) {
  const u = normalizeSupabaseUrl(url);
  if (!u.ok) throw new Error(u.error);
  const k = validateSupabaseKey(key);
  if (!k.ok) throw new Error(k.error);
  return `${PREFIX}?u=${encodeURIComponent(u.url)}&k=${encodeURIComponent(k.key)}`;
}

// Text (a scanned code, or a paste) -> { ok: true, url, key } or { ok: false, error }.
function decodeSetupCode(text) {
  const raw = String(text || "").trim();
  if (!raw.toLowerCase().startsWith(PREFIX)) return { ok: false, error: "That isn't a Media Vault setup code." };
  let params;
  try { params = new URL(raw).searchParams; } catch { return { ok: false, error: "That setup code is damaged." }; }
  const u = normalizeSupabaseUrl(params.get("u"));
  if (!u.ok) return { ok: false, error: u.error };
  const k = validateSupabaseKey(params.get("k"));
  if (!k.ok) return { ok: false, error: k.error };
  return { ok: true, url: u.url, key: k.key };
}

const looksLikeSetupCode = (text) => String(text || "").trim().toLowerCase().startsWith(PREFIX);

module.exports = { encodeSetupCode, decodeSetupCode, looksLikeSetupCode, PREFIX };
