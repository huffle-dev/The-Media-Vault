// Writes test/fixtures/schema_v<N>.sql: the schema a FRESH install gets right now (database.js's _createSchema),
// as plain SQL. test/schemaParity.test.js loads that file as "a database from the baseline", runs the app's
// upgrade steps on it, and checks the result is identical to a fresh install, so a schema change written only
// as a migration step (or only in _createSchema) is caught.
//
// Run it ONCE when the upgrade chain is collapsed into a new baseline, never otherwise: the file must keep
// describing the old baseline, or the test would stop checking anything.
//
//   npx cross-env ELECTRON_RUN_AS_NODE=1 electron scripts/make-schema-baseline.js
//
// (It needs Electron's Node because better-sqlite3 is built for Electron.)
const fs = require("fs");
const os = require("os");
const path = require("path");
const Database = require("better-sqlite3");
const VaultDatabase = require("../database.js");

const file = path.join(os.tmpdir(), `vault-baseline-${Date.now()}.db`);
const fresh = new VaultDatabase(file);
fresh.initialise();
fresh.close();

const raw = new Database(file, { readonly: true });
const version = raw.pragma("user_version", { simple: true });
const rows = raw.prepare(`SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name`).all();
raw.close();
for (const suffix of ["", "-wal", "-shm"]) { try { fs.rmSync(file + suffix, { force: true }); } catch { /* temp file */ } }

const out = [
  `-- Schema of a database at user_version ${version}: what database.js's _createSchema() produces for a fresh install,`,
  `-- written by scripts/make-schema-baseline.js when the upgrade chain was collapsed into this baseline.`,
  `-- Used by test/schemaParity.test.js to prove that this baseline plus every later upgrade step lands on exactly`,
  `-- the same schema as a fresh install. Do not regenerate it unless the chain is collapsed again.`,
  ...rows.map((r) => `${r.sql};`),
  `PRAGMA user_version = ${version};`,
  "",
].join("\n");
const target = path.join(__dirname, "..", "test", "fixtures", `schema_v${version}.sql`);
fs.writeFileSync(target, out);
console.log(`Wrote ${path.relative(path.join(__dirname, ".."), target)} (${rows.length} objects, user_version ${version}).`);
