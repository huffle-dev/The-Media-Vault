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

// A database at the given schema version with a few rows, made by creating a fresh one and then setting
// user_version (only the version number matters to the open/refuse/backup behaviour tested here).
function libraryAt(version, dir) {
  const file = path.join(dir, "vault.db");
  const db = new VaultDatabase(file);
  db.initialise();
  db.close();
  const raw = new Database(file);
  const add = raw.prepare(`INSERT INTO media_items (title, media_type, sync_id) VALUES (?, ?, ?)`);
  add.run("A Game", "Game", "sync-game-1");
  add.run("A Film", "Movie", "sync-movie-1");
  raw.prepare(`INSERT INTO list_items (list_id, item_id) VALUES (1, 1)`).run();
  raw.pragma(`user_version = ${version}`);
  raw.close();
  return file;
}

const tryOpen = (file) => {
  const db = new VaultDatabase(file);
  try { db.initialise(); } finally { db.close(); }
};

describe("opening a database against the baseline (schema v52)", () => {
  it("opens one at the current version and keeps its rows", () => {
    const file = libraryAt(52, makeDir());
    tryOpen(file);
    const raw = new Database(file, { readonly: true });
    expect(raw.prepare(`SELECT COUNT(*) n FROM media_items`).get().n).toBe(2);
    expect(raw.pragma("user_version", { simple: true })).toBe(52);
    raw.close();
  });

  it("refuses one from a NEWER version, with a message that says to update", () => {
    const file = libraryAt(53, makeDir());
    expect(() => tryOpen(file)).toThrow(/newer version of The Media Vault \(schema v53/);
  });

  it("refuses one older than the baseline, saying how old it is and what the oldest openable is", () => {
    const file = libraryAt(50, makeDir());
    expect(() => tryOpen(file)).toThrow(/older version of The Media Vault \(schema v50\).*oldest it can open is v52/);
  });
});

describe("automatic backup before a database is changed or refused", () => {
  it("copies an out-of-date database next to the live one first, holding its rows", () => {
    const dir = makeDir();
    const file = libraryAt(50, dir);
    expect(() => tryOpen(file)).toThrow();
    const backup = `${file}.pre-v50.bak`;
    expect(fs.existsSync(backup)).toBe(true);
    const old = new Database(backup, { readonly: true });
    expect(old.pragma("user_version", { simple: true })).toBe(50);
    expect(old.prepare(`SELECT COUNT(*) n FROM media_items`).get().n).toBe(2);
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
    expect(() => tryOpen(file)).toThrow();
    const left = fs.readdirSync(dir).filter((f) => f.endsWith(".bak")).sort();
    expect(left).toEqual(["vault.db.pre-v42.bak", "vault.db.pre-v43.bak", "vault.db.pre-v50.bak"]);
  });
});
