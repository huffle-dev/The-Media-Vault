// Everything "bring your own server" needs that isn't a screen: tidy up and
// validate the Supabase URL and key a person pastes in, and test a connection
// (is the server there, does it accept the key, has the setup SQL been run).
// Shared by the desktop app (main process) and the phone app, and written
// against an injected `fetch` so it can be tested without a network.
//
// The key being asked for is the PUBLISHABLE (formerly "anon") key — safe to
// ship in an app because row-level security limits what it can do. The SECRET
// (service-role) key bypasses security entirely, so it is refused outright: a
// person who pastes the wrong one is told so instead of storing it on a phone.

// What a working server must have, and the one column added after the first
// version of the schema (so an out-of-date schema is caught, not just a missing one).
const REQUIRED_TABLES = [
  "items", "lists", "list_items", "custom_types", "custom_type_fields", "devices",
  "item_locations", "discovery_dismissed", "encrypted_secrets", "secret_vault",
];
const REQUIRED_COLUMNS = [{ table: "items", column: "cover_art_url" }];
// Storage bucket for cover thumbnails (setup SQL section 6).
const REQUIRED_BUCKET = "covers";

// "https://abcd.supabase.co/" / "abcd.supabase.co" / ".../rest/v1" -> { ok, url } | { ok:false, error }
function normalizeSupabaseUrl(input) {
  let raw = String(input || "").trim();
  if (!raw) return { ok: false, error: "Enter your project URL (it looks like https://abcdefgh.supabase.co)." };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;
  let u;
  try { u = new URL(raw); } catch { return { ok: false, error: "That doesn't look like a web address." }; }
  const local = /^(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)$/.test(u.hostname);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) {
    return { ok: false, error: "The project URL must start with https://" };
  }
  if (!u.hostname.includes(".") && !local) return { ok: false, error: "That doesn't look like a project URL." };
  return { ok: true, url: u.origin };
}

function decodeJwtPayload(token) {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = typeof Buffer !== "undefined" ? Buffer.from(part, "base64").toString("utf8") : atob(part);
    return JSON.parse(json);
  } catch { return null; }
}

// -> { ok, key } | { ok:false, error }
function validateSupabaseKey(input) {
  const key = String(input || "").trim();
  if (!key) return { ok: false, error: "Enter your project's publishable (anon) key." };
  if (/\s/.test(key)) return { ok: false, error: "The key has spaces or line breaks in it — copy just the key." };
  if (key.startsWith("sb_secret_")) return { ok: false, error: "That is a SECRET key. Use the publishable key (it starts with sb_publishable_) — never put the secret key in an app." };
  if (key.startsWith("sb_publishable_")) return { ok: true, key };
  if (/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(key)) {
    const payload = decodeJwtPayload(key);
    if (payload && payload.role === "service_role") {
      return { ok: false, error: "That is the service_role (secret) key. Use the anon / publishable key instead — never put the secret key in an app." };
    }
    return { ok: true, key };
  }
  return { ok: false, error: "That doesn't look like a Supabase key. Use the publishable key from Project Settings → API Keys." };
}

const hostOf = (url) => { try { return new URL(url).host; } catch { return url; } };

// Is the table there? 200 = yes (row-level security hides the rows, so the
// list is empty). 404 or a "relation does not exist" body = no.
async function tableExists(fetchFn, url, key, table, select = "*") {
  const res = await fetchFn(`${url}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=0`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (res.ok) return { exists: true };
  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  const code = body && body.code;
  if (res.status === 404 || code === "PGRST205" || code === "42P01") return { exists: false };
  // 42703 / PGRST204: the table is there but the column isn't.
  if (code === "42703" || code === "PGRST204") return { exists: true, columnMissing: true };
  const err = new Error((body && (body.message || body.error)) || `HTTP ${res.status}`);
  err.status = res.status;
  throw err;
}

// -> { ok, stage, message, missing? }. stage: "address" | "network" | "key" | "schema" | "server" | "ready"
async function testSupabaseConnection({ url, key, fetch: fetchFn = (typeof fetch === "function" ? fetch : null), timeoutMs = 12000 }) {
  const u = normalizeSupabaseUrl(url);
  if (!u.ok) return { ok: false, stage: "address", message: u.error };
  const k = validateSupabaseKey(key);
  if (!k.ok) return { ok: false, stage: "key", message: k.error };
  if (!fetchFn) return { ok: false, stage: "network", message: "This device can't make network requests." };

  const withTimeout = (fn) => {
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    const wrapped = (input, init = {}) => fn(input, ctrl ? { ...init, signal: ctrl.signal } : init);
    return { wrapped, done: () => timer && clearTimeout(timer) };
  };
  const { wrapped, done } = withTimeout(fetchFn);
  try {
    // 1. Is there a Supabase project at this address, and does it accept the key?
    let auth;
    try {
      auth = await wrapped(`${u.url}/auth/v1/settings`, { headers: { apikey: k.key } });
    } catch {
      return { ok: false, stage: "network", message: `Can't reach ${hostOf(u.url)}. Check the project URL and your internet connection (a paused free project also stops answering until you restore it in the Supabase dashboard).` };
    }
    if (auth.status === 401 || auth.status === 403) return { ok: false, stage: "key", message: "The server rejected that key. Copy the publishable key again from Project Settings → API Keys." };
    if (!auth.ok) return { ok: false, stage: "address", message: `${hostOf(u.url)} answered, but it doesn't look like a Supabase project (HTTP ${auth.status}). Check the URL.` };

    // 2. Has the setup SQL been run (every table, and the newest column)?
    const missing = [];
    let outdated = false;
    for (const table of REQUIRED_TABLES) {
      const r = await tableExists(wrapped, u.url, k.key, table);
      if (!r.exists) missing.push(table);
    }
    if (!missing.length) {
      for (const { table, column } of REQUIRED_COLUMNS) {
        const r = await tableExists(wrapped, u.url, k.key, table, column);
        if (r.columnMissing || !r.exists) outdated = true;
      }
    }
    // Is the covers bucket there? A public object URL answers "Bucket not found"
    // when it isn't and "Object not found" when it is (the object just isn't).
    let noBucket = false;
    if (!missing.length && !outdated) {
      const b = await wrapped(`${u.url}/storage/v1/object/public/${REQUIRED_BUCKET}/_probe.jpg`, { headers: { apikey: k.key } });
      if (b.status === 404 || b.status === 400) {
        let body = null;
        try { body = await b.json(); } catch { /* not JSON */ }
        noBucket = /bucket not found/i.test(JSON.stringify(body || ""));
      }
    }
    if (missing.length === REQUIRED_TABLES.length) {
      return { ok: false, stage: "schema", missing, message: "Connected, but the database is empty. Run the setup SQL (the Copy setup SQL button), then test again." };
    }
    if (missing.length) {
      return { ok: false, stage: "schema", missing, message: `Connected, but ${missing.length} table${missing.length === 1 ? " is" : "s are"} missing (${missing.join(", ")}). Run the setup SQL again — it is safe to re-run.` };
    }
    if (outdated) {
      return { ok: false, stage: "schema", missing: [], message: "Connected, but the database is out of date. Run the setup SQL again — it is safe to re-run." };
    }
    if (noBucket) {
      return { ok: false, stage: "schema", missing: [], message: "Connected, but the cover-picture storage isn't set up. Run the setup SQL again — it is safe to re-run." };
    }
    return { ok: true, stage: "ready", message: `Connected to ${hostOf(u.url)} — the database is set up.` };
  } catch (err) {
    return { ok: false, stage: "server", message: `The server returned an error: ${err.message}` };
  } finally {
    done();
  }
}

// The saved settings -> { url, key } or null. `legacy` ({ url, key }) is the
// connection an install used before the server became configurable; it applies
// only while `hasExistingLogin` is true, so an existing, already-signed-in
// install keeps working after the update while a brand-new one starts unset.
function resolveSupabaseConfig({ savedUrl, savedKey, legacy, hasExistingLogin }) {
  if (savedUrl && savedKey) return { url: savedUrl, key: savedKey, source: "saved" };
  if (legacy && legacy.url && legacy.key && hasExistingLogin) return { url: legacy.url, key: legacy.key, source: "legacy" };
  return null;
}

// Where to reset a forgotten password: the Users page of the person's own
// Supabase project (the account lives there, so that is the only place it can be
// reset). Only a hosted project (<ref>.supabase.co) has such a page; a self-hosted
// or custom-domain server returns null.
function supabaseUsersDashboardUrl(projectUrl) {
  let host;
  try { host = new URL(String(projectUrl || "")).hostname; } catch { return null; }
  const m = /^([a-z0-9]{10,30})\.supabase\.co$/i.exec(host);
  return m ? `https://supabase.com/dashboard/project/${m[1].toLowerCase()}/auth/users` : null;
}

module.exports = {
  supabaseUsersDashboardUrl,
  REQUIRED_TABLES, REQUIRED_COLUMNS,
  normalizeSupabaseUrl, validateSupabaseKey, testSupabaseConnection, resolveSupabaseConfig,
};
