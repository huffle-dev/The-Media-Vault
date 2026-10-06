// One-off verification for the Cloud Sync schema (V3 step 2, build step 2)
// — confirms your own signed-in account can actually read/write its own
// rows on every new table, and that a CHECK constraint really fires. Every
// row this script creates is deleted again before it exits, whether it
// passes or fails.
//
//   node scripts/verify-cloud-sync-schema.js
//
// Asks for your Supabase login email/password when it runs — never stored
// or written anywhere. Run it in your own terminal (it needs typing).

const readline = require("readline");
const { createClient } = require("@supabase/supabase-js");
const { SUPABASE_URL, SUPABASE_KEY } = require("../lib/supabaseConfig");

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(s); else process.stdout.write("*"); };
    }
    rl.question(question, (answer) => { rl.close(); if (hidden) process.stdout.write("\n"); resolve(answer.trim()); });
  });
}

let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const email = await ask("Supabase login email: ");
  const password = await ask("Supabase login password: ", { hidden: true });
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
  if (authErr) { console.error("Login failed:", authErr.message); process.exit(1); }
  const userId = auth.user.id;
  console.log(`Logged in as ${userId}.\n`);

  const cleanup = [];

  console.log("custom_types / custom_type_fields:");
  {
    const { data: ct, error } = await supabase.from("custom_types")
      .insert({ user_id: userId, label: "verify-schema test type", icon: "🧪", color: "#ff00ff" })
      .select().single();
    check("insert own custom_types row", !error, error?.message);
    if (ct) {
      cleanup.push(["custom_types", "sync_id", ct.sync_id]);
      const { data: got } = await supabase.from("custom_types").select().eq("sync_id", ct.sync_id).maybeSingle();
      check("read it back", got?.label === "verify-schema test type");

      const { data: ctf, error: ctfErr } = await supabase.from("custom_type_fields")
        .insert({ custom_type_sync_id: ct.sync_id, key: "k1", label: "Field 1", field_type: "text" })
        .select().single();
      check("insert a field under it (join-scoped policy)", !ctfErr, ctfErr?.message);
      if (ctf) cleanup.push(["custom_type_fields", "sync_id", ctf.sync_id]);
    }
  }

  console.log("\nlists:");
  let listSyncId;
  {
    const { data, error } = await supabase.from("lists")
      .insert({ user_id: userId, name: "verify-schema test list " + Date.now() })
      .select().single();
    check("insert own lists row", !error, error?.message);
    if (data) { listSyncId = data.sync_id; cleanup.push(["lists", "sync_id", data.sync_id]); }
  }

  console.log("\nitems:");
  let itemSyncId;
  {
    const { data, error } = await supabase.from("items")
      .insert({ user_id: userId, title: "verify-schema test item", media_type: "Movie", status: "wishlist" })
      .select().single();
    check("insert own items row", !error, error?.message);
    if (data) { itemSyncId = data.sync_id; cleanup.push(["items", "sync_id", data.sync_id]); }

    const { error: badRatingErr } = await supabase.from("items")
      .insert({ user_id: userId, title: "bad rating", media_type: "Movie", rating: 999 });
    check("CHECK constraint rejects rating=999", !!badRatingErr, badRatingErr ? undefined : "insert unexpectedly succeeded");
  }

  console.log("\nitem_locations / list_items (join-scoped policies):");
  if (itemSyncId) {
    const { data: dev, error: devErr } = await supabase.from("devices")
      .insert({ user_id: userId, name: "verify-schema test device", platform: "desktop" })
      .select().single();
    check("insert own devices row", !devErr, devErr?.message);
    if (dev) {
      cleanup.push(["devices", "device_id", dev.device_id]);
      const { error: ilErr } = await supabase.from("item_locations")
        .insert({ item_sync_id: itemSyncId, device_id: dev.device_id, is_local: true });
      check("insert item_locations row for own item+device", !ilErr, ilErr?.message);
      if (!ilErr) cleanup.push(["item_locations", "item_sync_id", itemSyncId]);
    }
  }
  if (itemSyncId && listSyncId) {
    const { error: liErr } = await supabase.from("list_items")
      .insert({ list_sync_id: listSyncId, item_sync_id: itemSyncId });
    check("insert list_items row for own list+item", !liErr, liErr?.message);
    if (!liErr) cleanup.push(["list_items", "list_sync_id", listSyncId]);
  }

  console.log("\nCleaning up test rows...");
  for (const [table, col, val] of cleanup.reverse()) {
    await supabase.from(table).delete().eq(col, val);
  }
  await supabase.auth.signOut();

  console.log(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
