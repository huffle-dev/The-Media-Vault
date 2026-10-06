import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import VaultDatabase from "../database.js";
import cloudSync from "../lib/cloudSync.js";

// supabase/schema_current.sql is the one file a new Supabase project is set up
// from. If Cloud Sync starts pushing a column the file doesn't create, a fresh
// project silently rejects every item upload — so this fails first.

const root = path.join(__dirname, "..");
const sql = fs.readFileSync(path.join(root, "supabase", "schema_current.sql"), "utf8");

// Column names declared for `table`: its create-table body plus any later
// "alter table <table> add column if not exists <name>".
function columnsOf(table) {
  const body = new RegExp(`create table if not exists ${table} \\(([\\s\\S]*?)\\n\\);`).exec(sql);
  expect(body, `create table for ${table}`).toBeTruthy();
  const cols = new Set();
  for (const line of body[1].split("\n")) {
    const m = /^\s{2}([a-z_][a-z0-9_]*)\s+[a-z]/.exec(line);
    if (m && !["primary", "unique", "constraint", "foreign", "check"].includes(m[1])) cols.add(m[1]);
  }
  for (const m of sql.matchAll(new RegExp(`alter table ${table} add column if not exists ([a-z_0-9]+)`, "g"))) cols.add(m[1]);
  return cols;
}

// ITEM_COLUMNS in lib/cloudSync.js is not exported; read it from the source.
function syncedItemColumns() {
  const src = fs.readFileSync(path.join(root, "lib", "cloudSync.js"), "utf8");
  const block = /const ITEM_COLUMNS = \[([\s\S]*?)\];/.exec(src);
  expect(block, "ITEM_COLUMNS in lib/cloudSync.js").toBeTruthy();
  return [...block[1].matchAll(/"([a-z_0-9]+)"/g)].map((m) => m[1]);
}

describe("supabase/schema_current.sql", () => {
  it("creates every column Cloud Sync pushes for an item", () => {
    const have = columnsOf("items");
    const missing = syncedItemColumns().filter((c) => !have.has(c));
    expect(missing).toEqual([]);
  });

  it("has the cover art link, fractional series order and the sync keys", () => {
    const have = columnsOf("items");
    for (const c of ["sync_id", "user_id", "updated_at", "deleted_at", "cover_art_url"]) expect(have.has(c), c).toBe(true);
    expect(sql).toMatch(/series_order\s+double precision/);
  });

  // The push sends EVERY column of media_items that is not on the exclude list (lib/cloudSync.js buildRow), so a
  // new local-only column that is not excluded makes the cloud reject every item with "could not find the column".
  // (That happened once with owned_elsewhere.) This builds a real database and checks what would be sent.
  it("pushes only columns the cloud's items table has", () => {
    const dbPath = path.join(os.tmpdir(), `vault-push-cols-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    const db = new VaultDatabase(dbPath);
    db.initialise();
    const local = db.db.prepare("PRAGMA table_info(media_items)").all().map((c) => c.name);
    db.db.close();
    for (const suffix of ["", "-wal", "-shm"]) { try { fs.unlinkSync(dbPath + suffix); } catch { /* gone */ } }
    // what the push query adds on top of media_items.* (see pushChanges), and the user_id/deleted_at it sets
    const sent = [...local.filter((c) => !cloudSync.ITEM_EXCLUDE.has(c)), "custom_type_sync_id", "cover_art_url", "user_id", "deleted_at"];
    const have = columnsOf("items");
    expect(sent.filter((c) => !have.has(c))).toEqual([]);
  });

  it("creates the other synced tables, each with row-level security", () => {
    for (const t of ["devices", "custom_types", "custom_type_fields", "lists", "items", "item_locations", "list_items", "secret_vault", "encrypted_secrets", "discovery_dismissed", "app_settings"]) {
      expect(sql, `${t} table`).toMatch(new RegExp(`create table if not exists ${t} \\(`));
      expect(sql, `${t} RLS`).toMatch(new RegExp(`alter table ${t} enable row level security`));
    }
  });

  it("creates the public covers bucket and lets users write only into their own folder", () => {
    expect(sql).toMatch(/insert into storage\.buckets[\s\S]*'covers'/);
    for (const op of ["select", "insert", "update", "delete"]) expect(sql, op).toMatch(new RegExp(`create policy "covers_${op}_own" on storage\.objects`));
    expect(sql).toMatch(/storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/);
  });

  it("can be run again: every policy is dropped before it is created", () => {
    const creates = [...sql.matchAll(/^create policy ("[^"]+") on (\w+)/gm)].map((m) => `${m[1]} ${m[2]}`);
    const drops = new Set([...sql.matchAll(/^drop policy if exists ("[^"]+") on (\w+)/gm)].map((m) => `${m[1]} ${m[2]}`));
    expect(creates.length).toBeGreaterThan(0);
    expect(creates.filter((c) => !drops.has(c))).toEqual([]);
  });
});
