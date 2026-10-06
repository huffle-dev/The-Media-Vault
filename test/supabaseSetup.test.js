import { describe, it, expect } from "vitest";
import setup from "@media-vault/core/supabaseSetup";

const { normalizeSupabaseUrl, validateSupabaseKey, testSupabaseConnection, resolveSupabaseConfig, REQUIRED_TABLES } = setup;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (payload) => `eyJ${b64({ alg: "HS256" }).slice(3)}.${b64(payload)}.sig_nature-1`;

describe("normalizeSupabaseUrl", () => {
  it("tidies what people paste", () => {
    for (const [input, out] of [
      ["https://abcd.supabase.co", "https://abcd.supabase.co"],
      ["https://abcd.supabase.co/", "https://abcd.supabase.co"],
      ["  abcd.supabase.co  ", "https://abcd.supabase.co"],
      ["https://abcd.supabase.co/rest/v1/", "https://abcd.supabase.co"],
      ["https://db.example.com", "https://db.example.com"],
    ]) expect(normalizeSupabaseUrl(input)).toEqual({ ok: true, url: out });
  });
  it("allows plain http only for a local server", () => {
    expect(normalizeSupabaseUrl("http://localhost:54321")).toEqual({ ok: true, url: "http://localhost:54321" });
    expect(normalizeSupabaseUrl("http://192.168.1.20:8000").ok).toBe(true);
    expect(normalizeSupabaseUrl("http://abcd.supabase.co").ok).toBe(false);
  });
  it("rejects blanks and nonsense with a reason", () => {
    for (const bad of ["", "   ", null, "not a url", "ftp://abcd.supabase.co", "https://nodots"]) {
      const r = normalizeSupabaseUrl(bad);
      expect(r.ok, String(bad)).toBe(false);
      expect(r.error).toBeTruthy();
    }
  });
});

describe("validateSupabaseKey", () => {
  it("accepts a publishable key and an anon JWT", () => {
    expect(validateSupabaseKey("sb_publishable_abc123")).toEqual({ ok: true, key: "sb_publishable_abc123" });
    const anon = jwt({ role: "anon" });
    expect(validateSupabaseKey(` ${anon} `)).toEqual({ ok: true, key: anon });
  });
  it("refuses the secret keys, in both formats", () => {
    expect(validateSupabaseKey("sb_secret_abc").error).toMatch(/SECRET/);
    expect(validateSupabaseKey(jwt({ role: "service_role" })).error).toMatch(/service_role/);
  });
  it("refuses blanks, spaces and things that are not keys", () => {
    for (const bad of ["", null, "two words", "sb_publishable_a b", "hunter2"]) expect(validateSupabaseKey(bad).ok, String(bad)).toBe(false);
  });
});

// A fake server: which tables exist, whether the key is accepted, and an
// optional missing column.
function server({ reachable = true, authStatus = 200, tables = REQUIRED_TABLES, noCoverArtUrl = false, boom = false, noBucket = false } = {}) {
  const calls = [];
  const fetch = async (url) => {
    calls.push(url);
    if (!reachable) throw new TypeError("Network request failed");
    const u = new URL(url);
    if (u.pathname === "/auth/v1/settings") return { ok: authStatus === 200, status: authStatus, json: async () => ({}) };
    if (u.pathname.startsWith("/storage/v1/object/public/")) {
      return { ok: false, status: 404, json: async () => ({ statusCode: "404", error: noBucket ? "Bucket not found" : "Object not found" }) };
    }
    const table = u.pathname.split("/").pop();
    if (boom) return { ok: false, status: 500, json: async () => ({ message: "internal" }) };
    if (!tables.includes(table)) return { ok: false, status: 404, json: async () => ({ code: "PGRST205", message: "no table" }) };
    if (noCoverArtUrl && u.searchParams.get("select") === "cover_art_url") return { ok: false, status: 400, json: async () => ({ code: "42703", message: "column does not exist" }) };
    return { ok: true, status: 200, json: async () => [] };
  };
  return { fetch, calls };
}
const good = { url: "https://abcd.supabase.co", key: "sb_publishable_abc" };

describe("testSupabaseConnection", () => {
  it("reports a fully set-up server as ready", async () => {
    const r = await testSupabaseConnection({ ...good, fetch: server().fetch });
    expect(r).toMatchObject({ ok: true, stage: "ready" });
    expect(r.message).toMatch(/abcd\.supabase\.co/);
  });
  it("stops at a bad address or key before any network call", async () => {
    const s = server();
    expect((await testSupabaseConnection({ url: "nope", key: good.key, fetch: s.fetch })).stage).toBe("address");
    expect((await testSupabaseConnection({ url: good.url, key: "sb_secret_x", fetch: s.fetch })).stage).toBe("key");
    expect(s.calls).toEqual([]);
  });
  it("says so when the server cannot be reached", async () => {
    const r = await testSupabaseConnection({ ...good, fetch: server({ reachable: false }).fetch });
    expect(r).toMatchObject({ ok: false, stage: "network" });
    expect(r.message).toMatch(/paused/);
  });
  it("tells a rejected key from a wrong address", async () => {
    expect((await testSupabaseConnection({ ...good, fetch: server({ authStatus: 401 }).fetch })).stage).toBe("key");
    expect((await testSupabaseConnection({ ...good, fetch: server({ authStatus: 404 }).fetch })).stage).toBe("address");
  });
  it("detects an empty database, a partly set-up one and an out-of-date one", async () => {
    const empty = await testSupabaseConnection({ ...good, fetch: server({ tables: [] }).fetch });
    expect(empty).toMatchObject({ ok: false, stage: "schema" });
    expect(empty.message).toMatch(/empty/);
    const partial = await testSupabaseConnection({ ...good, fetch: server({ tables: REQUIRED_TABLES.filter((t) => t !== "secret_vault") }).fetch });
    expect(partial.missing).toEqual(["secret_vault"]);
    expect(partial.message).toMatch(/secret_vault/);
    const old = await testSupabaseConnection({ ...good, fetch: server({ noCoverArtUrl: true }).fetch });
    expect(old).toMatchObject({ ok: false, stage: "schema" });
    expect(old.message).toMatch(/out of date/);
  });
  it("notices a missing covers bucket, but not a missing picture in an existing one", async () => {
    const r = await testSupabaseConnection({ ...good, fetch: server({ noBucket: true }).fetch });
    expect(r).toMatchObject({ ok: false, stage: "schema" });
    expect(r.message).toMatch(/storage/);
    expect((await testSupabaseConnection({ ...good, fetch: server().fetch })).ok).toBe(true);
  });
  it("reports a server error instead of throwing", async () => {
    const r = await testSupabaseConnection({ ...good, fetch: server({ boom: true }).fetch });
    expect(r).toMatchObject({ ok: false, stage: "server" });
  });
  it("sends the key on every request", async () => {
    const seen = [];
    await testSupabaseConnection({ ...good, fetch: async (url, init) => { seen.push(init.headers.apikey); return { ok: true, status: 200, json: async () => [] }; } });
    expect(seen.length).toBeGreaterThan(5);
    expect(new Set(seen)).toEqual(new Set([good.key]));
  });
});

describe("resolveSupabaseConfig", () => {
  const legacy = { url: "https://old.supabase.co", key: "sb_publishable_old" };
  it("uses what was saved", () => {
    expect(resolveSupabaseConfig({ savedUrl: "https://new.supabase.co", savedKey: "k", legacy, hasExistingLogin: true })).toMatchObject({ url: "https://new.supabase.co", source: "saved" });
  });
  it("keeps an install that was already signed in on the old server", () => {
    expect(resolveSupabaseConfig({ legacy, hasExistingLogin: true })).toMatchObject({ url: legacy.url, source: "legacy" });
  });
  it("leaves a brand-new install unconfigured", () => {
    expect(resolveSupabaseConfig({ legacy, hasExistingLogin: false })).toBeNull();
    expect(resolveSupabaseConfig({ savedUrl: "https://x.supabase.co", legacy: null, hasExistingLogin: true })).toBeNull(); // key missing
  });
});

describe("supabaseUsersDashboardUrl (where to reset a forgotten password)", () => {
  const { supabaseUsersDashboardUrl } = setup;
  it("points a hosted project at its Users page", () => {
    expect(supabaseUsersDashboardUrl("https://abcdefghijklmnop.supabase.co")).toBe("https://supabase.com/dashboard/project/abcdefghijklmnop/auth/users");
    expect(supabaseUsersDashboardUrl("https://AbcdefghijKLMNOP.supabase.co/rest/v1")).toBe("https://supabase.com/dashboard/project/abcdefghijklmnop/auth/users");
  });
  it("has no link for a self-hosted or custom-domain server, or junk", () => {
    expect(supabaseUsersDashboardUrl("https://db.example.com")).toBeNull();
    expect(supabaseUsersDashboardUrl("http://192.168.1.5:54321")).toBeNull();
    expect(supabaseUsersDashboardUrl("https://evil.com/x.supabase.co")).toBeNull();
    expect(supabaseUsersDashboardUrl("not a url")).toBeNull();
    expect(supabaseUsersDashboardUrl(undefined)).toBeNull();
  });
});
