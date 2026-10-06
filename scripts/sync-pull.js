// Pull half of Cloud Sync (V3 step 2, build step 4) — a thin CLI wrapper
// over lib/cloudSync.js's pullChanges(), the same function the app itself
// now calls.
//
//   node scripts/sync-pull.js [path-to-vault.db]
//
// Defaults to the real desktop database. Pass a different path to pull
// into a second, empty database standing in for a second device. Close the
// app first if pulling into the real database. Asks for your Supabase
// login each run; never stored.

const os = require("os");
const path = require("path");
const readline = require("readline");
const { createClient } = require("@supabase/supabase-js");
const VaultDatabase = require("../database.js");
const { SUPABASE_URL, SUPABASE_KEY } = require("../lib/supabaseConfig");
const { pullChanges } = require("../lib/cloudSync");

const DB_PATH = process.argv[2] || path.join(os.homedir(), "AppData", "Roaming", "the-vault", "vault.db");
const LAST_PULLED_KEY = "cloud_sync_last_pulled_at";

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(s); else process.stdout.write("*"); };
    }
    rl.question(question, (answer) => { rl.close(); if (hidden) process.stdout.write("\n"); resolve(answer.trim()); });
  });
}

(async () => {
  const db = new VaultDatabase(DB_PATH);
  db.initialise();

  const lastPulledAt = db.getSetting(LAST_PULLED_KEY) || "1970-01-01T00:00:00";
  console.log("Database:", DB_PATH);
  console.log("Pulling changes since", lastPulledAt, "\n");

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const email = await ask("Supabase login email: ");
  const password = await ask("Supabase login password: ", { hidden: true });
  const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
  if (authErr) { console.error("Login failed:", authErr.message); process.exit(1); }
  console.log("Logged in.\n");

  // Captured before any reads happen — this run's new checkpoint, written
  // back only on full success (same reasoning as sync-push.js).
  const startedAt = new Date().toISOString();

  const { inserted, updated, skipped, deleted } = await pullChanges(db, supabase, lastPulledAt);

  db.setSetting(LAST_PULLED_KEY, startedAt);
  console.log(`Checkpoint advanced to ${startedAt}`);
  console.log(`\n${inserted} inserted, ${updated} updated, ${skipped} skipped (local already newer), ${deleted} deleted.`);

  await supabase.auth.signOut();
  db.close();
})().catch((e) => { console.error(e); process.exit(1); });
