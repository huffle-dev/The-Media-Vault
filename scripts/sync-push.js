// One-way push half of Cloud Sync (V3 step 2, build step 3) — a thin CLI
// wrapper over lib/cloudSync.js's pushChanges(), the same function the app
// itself now calls. Manual, one-way only: nothing is pulled back here (see
// sync-pull.js). Safe to re-run — every table upserts on its own sync_id /
// composite key, never inserts a duplicate.
//
//   node scripts/sync-push.js
//
// Close the app before running this — it opens the same database file
// directly. Asks for your Supabase login email/password when it runs —
// never stored or written anywhere.

const os = require("os");
const path = require("path");
const crypto = require("crypto");
const readline = require("readline");
const { createClient } = require("@supabase/supabase-js");
const VaultDatabase = require("../database.js");
const { SUPABASE_URL, SUPABASE_KEY } = require("../lib/supabaseConfig");
const { pushChanges } = require("../lib/cloudSync");

const DB_PATH = path.join(os.homedir(), "AppData", "Roaming", "the-vault", "vault.db");
const DEVICE_ID_KEY = "cloud_sync_device_id";
const LAST_SYNCED_KEY = "cloud_sync_last_synced_at";

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

  let deviceId = db.getSetting(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    db.setSetting(DEVICE_ID_KEY, deviceId);
    console.log("Assigned this device id:", deviceId);
  }
  const lastSyncedAt = db.getSetting(LAST_SYNCED_KEY) || "1970-01-01 00:00:00";
  console.log("Pushing changes since", lastSyncedAt, "\n");

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const email = await ask("Supabase login email: ");
  const password = await ask("Supabase login password: ", { hidden: true });
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
  if (authErr) { console.error("Login failed:", authErr.message); process.exit(1); }
  console.log("Logged in.\n");

  // Captured before any reads happen — this run's new checkpoint, written
  // back only on full success, so a failed run retries everything since
  // the last real success rather than silently skipping rows that changed
  // mid-push.
  const startedAt = new Date().toISOString().replace("T", " ").replace("Z", "").split(".")[0];

  const counts = await pushChanges(db, supabase, {
    userId: auth.user.id, deviceId, since: lastSyncedAt,
    deviceName: os.hostname() || "Desktop", devicePlatform: "desktop",
  });
  for (const [table, n] of Object.entries(counts)) console.log(`${table}: ${n} pushed`);

  db.setSetting(LAST_SYNCED_KEY, startedAt);
  console.log("\nCheckpoint advanced to", startedAt);

  console.log("\nCloud row counts for this account:");
  for (const t of ["items", "lists", "custom_types", "custom_type_fields", "item_locations", "list_items", "devices"]) {
    const { count } = await supabase.from(t).select("*", { count: "exact", head: true });
    console.log(`  ${t}: ${count}`);
  }

  await supabase.auth.signOut();
  db.close();
})().catch((e) => { console.error(e); process.exit(1); });
