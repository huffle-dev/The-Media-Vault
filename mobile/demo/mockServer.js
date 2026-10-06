// A tiny in-memory stand-in for the Supabase client, just big enough for the phone app's own queries
// (select / insert / update / upsert / delete with eq, in, is, gt(e), order, range, single). It runs the
// phone app in a browser on the made-up demo library; nothing is sent anywhere and a refresh starts over.
import { buildSampleItems } from "../../demo/sampleData.js";

const USER = { id: "demo-user", email: "demo@example.com" };
const SESSION = { access_token: "demo", refresh_token: "demo", user: USER };

// Cover pictures sit next to the page, so their addresses must not depend on which screen is open: a relative
// "covers/x.jpg" is looked up from the CURRENT address, which is wrong on /item/... screens. The folder the app
// itself was loaded from is read off its own script's address (".../app/_expo/static/js/web/entry-xxx.js").
const COVER_BASE = (() => {
  try {
    const script = [...document.scripts].find((x) => /_expo\/static\/js\/web\//.test(x.src));
    if (script) return script.src.replace(/_expo\/static\/js\/web\/.*$/, "");
  } catch { /* fall through */ }
  return new URL("./", window.location.href).href;
})();

const now = () => new Date().toISOString();
const uuid = () => `demo-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;

function buildDb() {
  const iso = (d) => (d ? `${d}T12:00:00.000Z` : null);
  const items = buildSampleItems().map((it, i) => {
    const { id, cover_art_path, list_ids, custom_fields, metadata_fetched, ...rest } = it;
    return {
      ...rest,
      sync_id: `demo-item-${id}`,
      cover_art_url: `${COVER_BASE}${cover_art_path}`,
      is_hidden: 0, owned_platform: null, tags: null, series_name: null, series_order: null, content_rating: rest.content_rating || null,
      custom_type_sync_id: null, metadata_checked_date: null, watch_checked_date: null,
      created_at: iso(rest.date_added), updated_at: new Date(Date.now() - i * 60000).toISOString(), deleted_at: null,
    };
  });
  const byTitle = (t) => (items.find((i) => i.title === t) || {}).sync_id;
  const lists = [
    { sync_id: "demo-list-fav", name: "Favourites", is_default: true, deleted_at: null, updated_at: now() },
    { sync_id: "demo-list-weekend", name: "Weekend picks", is_default: false, deleted_at: null, updated_at: now() },
  ];
  const list_items = [];
  for (const t of ["Metropolis", "Sintel", "Frankenstein", "The Great Gatsby", "OpenTTD", "Ashes", "Go", "Safety Last!", "Spring"]) list_items.push({ list_sync_id: "demo-list-fav", item_sync_id: byTitle(t), deleted_at: null });
  for (const t of ["Sherlock Jr.", "The Time Machine", "SuperTuxKart", "Backgammon", "Infinity"]) list_items.push({ list_sync_id: "demo-list-weekend", item_sync_id: byTitle(t), deleted_at: null });
  const item_locations = ["Chess", "Go", "Backgammon", "Cribbage", "Dominoes", "Checkers"].map((t) => ({ item_sync_id: byTitle(t), device_id: "demo-desktop", is_local: true }));
  return {
    items, lists, list_items, item_locations,
    devices: [{ device_id: "demo-desktop", name: "Desktop", platform: "windows" }],
    app_settings: [], discovery_dismissed: [], custom_types: [], custom_type_fields: [], encrypted_secrets: [], secret_vault: [],
  };
}

const db = buildDb();

const matchers = {
  eq: (v, x) => v === x || String(v) === String(x),
  neq: (v, x) => !(v === x || String(v) === String(x)),
  in: (v, xs) => xs.some((x) => x === v || String(x) === String(v)),
  is: (v, x) => (x === null ? v == null : v === x),
  gt: (v, x) => v > x, gte: (v, x) => v >= x, lt: (v, x) => v < x, lte: (v, x) => v <= x,
};
const PK = { items: ["sync_id"], lists: ["sync_id"], list_items: ["list_sync_id", "item_sync_id"], item_locations: ["item_sync_id", "device_id"], devices: ["device_id"], app_settings: ["key"], custom_types: ["sync_id"], custom_type_fields: ["sync_id"], discovery_dismissed: ["media_type", "tmdb_id"] };

class Query {
  constructor(table) { this.table = table; this.op = "select"; this.filters = []; this.sorts = []; this.cols = "*"; this.opts = {}; this.rangeFrom = null; this.rangeTo = null; this.one = null; this.returning = false; }
  select(cols = "*", opts = {}) { if (this.op === "select") { this.cols = cols; this.opts = opts || {}; } else { this.returning = true; } return this; }
  insert(rows) { this.op = "insert"; this.payload = rows; return this; }
  update(patch) { this.op = "update"; this.payload = patch; return this; }
  upsert(rows, o = {}) { this.op = "upsert"; this.payload = rows; this.onConflict = o.onConflict; return this; }
  delete() { this.op = "delete"; return this; }
  order(col, o = {}) { this.sorts.push([col, o.ascending !== false]); return this; }
  range(a, b) { this.rangeFrom = a; this.rangeTo = b; return this; }
  limit(n) { this.rangeFrom = 0; this.rangeTo = n - 1; return this; }
  single() { this.one = "single"; return this; }
  maybeSingle() { this.one = "maybe"; return this; }
  then(res, rej) { return Promise.resolve().then(() => this.run()).then(res, rej); }
}
for (const f of Object.keys(matchers)) Query.prototype[f] = function (col, val) { this.filters.push([f, col, val]); return this; };

Query.prototype.rows = function () {
  const rows = db[this.table] || [];
  return rows.filter((r) => this.filters.every(([f, c, v]) => matchers[f](r[c], v)));
};
Query.prototype.shape = function (r) {
  let out = r;
  if (this.cols !== "*") {
    const names = this.cols.replace(/[a-z_]+\([^)]*\)/g, "").split(",").map((s) => s.trim()).filter(Boolean);
    out = {};
    for (const n of names) out[n] = r[n];
  }
  if (/devices\(/.test(this.cols)) { const d = db.devices.find((x) => x.device_id === r.device_id); out = { ...out, devices: d ? { name: d.name } : null }; }
  return out;
};
Query.prototype.run = function () {
  const table = db[this.table];
  if (!table) return { data: null, error: { message: `The demo has no "${this.table}" table.` } };
  let result;
  if (this.op === "insert" || this.op === "upsert") {
    const list = Array.isArray(this.payload) ? this.payload : [this.payload];
    result = [];
    for (const row of list) {
      const keys = this.onConflict ? this.onConflict.split(",").map((s) => s.trim()) : (PK[this.table] || []);
      const existing = this.op === "upsert" && keys.length ? table.find((r) => keys.every((k) => r[k] === row[k])) : null;
      if (existing) { Object.assign(existing, row); result.push(existing); } else { const created = { sync_id: row.sync_id || uuid(), deleted_at: null, ...row }; table.push(created); result.push(created); }
    }
    if (!this.returning) return { data: null, error: null };
  } else if (this.op === "update") {
    result = this.rows();
    result.forEach((r) => Object.assign(r, this.payload));
    if (!this.returning) return { data: null, error: null };
  } else if (this.op === "delete") {
    const gone = this.rows();
    db[this.table] = table.filter((r) => !gone.includes(r));
    return { data: null, error: null };
  } else {
    result = this.rows();
  }
  const total = result.length;
  for (const [col, asc] of [...this.sorts].reverse()) result = [...result].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1));
  if (this.rangeFrom !== null) result = result.slice(this.rangeFrom, this.rangeTo + 1);
  if (this.opts.head) return { data: null, count: total, error: null };
  const data = result.map((r) => this.shape(r));
  if (this.one) {
    if (data.length === 1) return { data: data[0], error: null };
    if (data.length === 0 && this.one === "maybe") return { data: null, error: null };
    return { data: null, error: { message: data.length ? "More than one row" : "Row not found", code: "PGRST116" } };
  }
  return { data, error: null, ...(this.opts.count ? { count: total } : {}) };
};

const listeners = new Set();
export const mockSupabase = {
  from: (table) => new Query(table),
  auth: {
    getSession: async () => ({ data: { session: SESSION }, error: null }),
    getUser: async () => ({ data: { user: USER }, error: null }),
    onAuthStateChange: (cb) => { listeners.add(cb); return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } }; },
    signOut: async () => ({ error: null }),
    signInWithPassword: async () => ({ data: { session: SESSION, user: USER }, error: null }),
    signUp: async () => ({ data: { session: SESSION, user: USER }, error: null }),
  },
};
