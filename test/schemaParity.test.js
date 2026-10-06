import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import VaultDatabase from "../database.js";

// A database created by a fresh install (database.js's _createSchema) and one
// carried forward from schema v25 through every migration must end up with
// the SAME schema. Without this, the two paths can drift silently — a column
// added only to _createSchema, or only by a migration, which is exactly how
// fresh installs once ended up missing four Board Game columns.
//
// test/fixtures/schema_v25.sql is what database.js produced just before the
// v26 migration existed (the oldest state the chain can still upgrade).

const tmp = [];
const tmpPath = (tag) => {
  const p = path.join(os.tmpdir(), `vault-parity-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  tmp.push(p);
  return p;
};
afterEach(() => {
  for (const p of tmp.splice(0)) for (const suffix of ["", "-wal", "-shm"]) { try { fs.rmSync(p + suffix, { force: true }); } catch { /* a still-open handle on Windows; the OS temp cleaner gets it */ } }
});

// Everything about the schema that behaviour depends on, in a comparable shape.
function describeSchema(file) {
  const db = new Database(file, { readonly: true });
  try {
    const tables = {};
    const names = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all().map((r) => r.name);
    for (const name of names) {
      const columns = {};
      for (const c of db.prepare(`PRAGMA table_info("${name}")`).all()) {
        columns[c.name] = { type: c.type, notnull: c.notnull, dflt: c.dflt_value, pk: c.pk };
      }
      // A UNIQUE constraint declared inline (fresh install) and a UNIQUE INDEX
      // added later (migrated) are the same guarantee under different names, so
      // unique ones are compared by their columns alone.
      const indexes = db.prepare(`PRAGMA index_list("${name}")`).all()
        .filter((i) => i.origin === "c" || i.origin === "u")
        .map((i) => {
          const cols = db.prepare(`PRAGMA index_info("${i.name}")`).all().map((x) => x.name).join(",");
          return i.unique ? `UNIQUE(${cols})` : `${i.name}(${cols})`;
        })
        .sort();
      const fks = db.prepare(`PRAGMA foreign_key_list("${name}")`).all()
        .map((f) => `${f.from}->${f.table}.${f.to} ${f.on_delete}`).sort();
      const sql = db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name).sql;
      const checks = [...sql.matchAll(/CHECK\s*\(\s*([a-z_]+)\s+IN\s*\(([^)]*)\)\s*\)/gi)]
        .map((m) => `${m[1]} IN (${m[2].replace(/\s+/g, "")})`).sort();
      tables[name] = { columns, indexes, fks, checks };
    }
    return { version: db.pragma("user_version", { simple: true }), tables };
  } finally {
    db.close();
  }
}

function freshInstall() {
  const file = tmpPath("fresh");
  const db = new VaultDatabase(file);
  db.initialise();
  db.close();
  return file;
}

function upgradedFromV25(seed) {
  const file = tmpPath("v25");
  const raw = new Database(file);
  raw.exec(fs.readFileSync(path.join(__dirname, "fixtures", "schema_v25.sql"), "utf8"));
  if (seed) seed(raw);
  raw.close();
  const db = new VaultDatabase(file);
  db.initialise();
  db.close();
  return file;
}

describe("schema parity: fresh install vs the migration chain from v25", () => {
  it("both end at the latest schema version", () => {
    const fresh = describeSchema(freshInstall());
    const migrated = describeSchema(upgradedFromV25());
    expect(migrated.version).toBe(fresh.version);
  });

  it("have the same tables", () => {
    const fresh = describeSchema(freshInstall());
    const migrated = describeSchema(upgradedFromV25());
    expect(Object.keys(migrated.tables)).toEqual(Object.keys(fresh.tables));
  });

  it("have the same columns, types, defaults and constraints in every table", () => {
    const fresh = describeSchema(freshInstall());
    const migrated = describeSchema(upgradedFromV25());
    const diffs = [];
    for (const name of Object.keys(fresh.tables)) {
      const f = fresh.tables[name], m = migrated.tables[name];
      // Compared as sets, not by position: ALTER TABLE ADD COLUMN appends, so
      // column ORDER legitimately differs between the two paths.
      const fNames = Object.keys(f.columns).sort(), mNames = Object.keys(m.columns).sort();
      if (JSON.stringify(fNames) !== JSON.stringify(mNames)) diffs.push(`${name}: columns fresh=[${fNames}] migrated=[${mNames}]`);
      for (const col of fNames.filter((c) => m.columns[c])) {
        // KNOWN, intended difference: SQLite's ALTER TABLE ADD COLUMN can't take
        // a non-constant DEFAULT, so migrated databases carry updated_at as a
        // plain nullable column (backfilled by the migration; every write path
        // sets it) while a fresh install has NOT NULL DEFAULT (datetime('now')).
        const norm = (c, def) => (col === "updated_at" ? { type: def.type, pk: def.pk } : def);
        if (JSON.stringify(norm(col, f.columns[col])) !== JSON.stringify(norm(col, m.columns[col]))) {
          diffs.push(`${name}.${col}: fresh=${JSON.stringify(f.columns[col])} migrated=${JSON.stringify(m.columns[col])}`);
        }
      }
      for (const key of ["indexes", "fks", "checks"]) {
        if (JSON.stringify(f[key]) !== JSON.stringify(m[key])) diffs.push(`${name} ${key}: fresh=${JSON.stringify(f[key])} migrated=${JSON.stringify(m[key])}`);
      }
    }
    expect(diffs).toEqual([]);
  });

  it("keeps an existing library intact and translates the old type names", () => {
    const file = upgradedFromV25((raw) => {
      const add = raw.prepare(`INSERT INTO media_items (title, media_type) VALUES (?, ?)`);
      add.run("An Old Film", "Film");
      add.run("A Game", "Game");
      raw.prepare(`INSERT INTO lists (name, is_default) VALUES ('Mine', 0)`).run();
      raw.prepare(`INSERT INTO list_items (list_id, item_id) VALUES (1, 1)`).run();
    });
    const db = new Database(file, { readonly: true });
    const rows = db.prepare(`SELECT title, media_type, sync_id FROM media_items ORDER BY id`).all();
    expect(rows.map((r) => [r.title, r.media_type])).toEqual([["An Old Film", "Movie"], ["A Game", "Game"]]);
    expect(rows.every((r) => r.sync_id)).toBe(true);
    expect(db.prepare(`SELECT COUNT(*) n FROM list_items`).get().n).toBe(1);
    db.close();
  });
});
