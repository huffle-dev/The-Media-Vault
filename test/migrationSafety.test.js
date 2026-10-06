import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import VaultDatabase from "../database.js";

const dirs = [];
const makeDir = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "vault-migsafe-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* handle still open on Windows */ } }
});

// A database at the given schema version with a few rows, made by creating a
// fresh one and then winding user_version back (the v51 step only deletes
// rows, so the schema shape doesn't matter).
function libraryAt(version, dir) {
  const file = path.join(dir, "vault.db");
  const db = new VaultDatabase(file);
  db.initialise();
  db.close();
  const raw = new Database(file);
  const add = raw.prepare(`INSERT INTO media_items (title, media_type, sync_id) VALUES (?, ?, ?)`);
  add.run("Ashnod's Cylix", "MTG", "sync-mtg-1");
  add.run("A Film", "Movie", "sync-movie-1");
  raw.prepare(`INSERT INTO list_items (list_id, item_id) VALUES (1, 1)`).run();
  raw.pragma(`user_version = ${version}`);
  raw.close();
  return file;
}

describe("v51: leftover MTG items are removed the way an in-app delete does", () => {
  it("deletes MTG rows, tombstones them for sync, and leaves everything else", () => {
    const file = libraryAt(50, makeDir());
    const db = new VaultDatabase(file);
    db.initialise();
    const rows = db.db.prepare(`SELECT title, media_type FROM media_items`).all();
    expect(rows).toEqual([{ title: "A Film", media_type: "Movie" }]);
    expect(db.db.prepare(`SELECT sync_id FROM item_tombstones`).all()).toEqual([{ sync_id: "sync-mtg-1" }]);
    expect(db.db.prepare(`SELECT COUNT(*) n FROM list_items`).get().n).toBe(0); // membership went with it
    expect(db.db.pragma("user_version", { simple: true })).toBe(52);
    db.close();
  });

  it("does nothing on a library with no MTG items", () => {
    const dir = makeDir();
    const file = libraryAt(50, dir);
    const raw = new Database(file);
    raw.prepare(`DELETE FROM media_items WHERE media_type = 'MTG'`).run();
    raw.close();
    const db = new VaultDatabase(file);
    db.initialise();
    expect(db.db.prepare(`SELECT COUNT(*) n FROM media_items`).get().n).toBe(1);
    expect(db.db.prepare(`SELECT COUNT(*) n FROM item_tombstones`).get().n).toBe(0);
    db.close();
  });
});

describe("automatic backup before a migration", () => {
  it("copies the old database next to the live one, holding the pre-migration rows", () => {
    const dir = makeDir();
    const file = libraryAt(50, dir);
    const db = new VaultDatabase(file);
    db.initialise();
    db.close();
    const backup = `${file}.pre-v50.bak`;
    expect(fs.existsSync(backup)).toBe(true);
    const old = new Database(backup, { readonly: true });
    expect(old.pragma("user_version", { simple: true })).toBe(50);
    expect(old.prepare(`SELECT COUNT(*) n FROM media_items WHERE media_type = 'MTG'`).get().n).toBe(1); // still there in the copy
    old.close();
  });

  it("makes no backup for a fresh install or one that is already current", () => {
    const dir = makeDir();
    const file = path.join(dir, "vault.db");
    const fresh = new VaultDatabase(file);
    fresh.initialise();
    fresh.close();
    expect(fs.readdirSync(dir).filter((f) => f.endsWith(".bak"))).toEqual([]);
    const again = new VaultDatabase(file);
    again.initialise();
    again.close();
    expect(fs.readdirSync(dir).filter((f) => f.endsWith(".bak"))).toEqual([]);
  });

  it("keeps only the three newest backups", () => {
    const dir = makeDir();
    const file = libraryAt(50, dir);
    for (const v of [41, 42, 43]) {
      fs.writeFileSync(`${file}.pre-v${v}.bak`, "old");
      const past = new Date(Date.now() - (50 - v) * 3600_000);
      fs.utimesSync(`${file}.pre-v${v}.bak`, past, past);
    }
    const db = new VaultDatabase(file);
    db.initialise();
    db.close();
    const left = fs.readdirSync(dir).filter((f) => f.endsWith(".bak")).sort();
    expect(left).toEqual(["vault.db.pre-v42.bak", "vault.db.pre-v43.bak", "vault.db.pre-v50.bak"]);
  });
});
