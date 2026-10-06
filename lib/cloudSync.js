// Cloud Sync's push/pull core (V3 step 2). Design: docs/cloud-sync-design.md.
// Pure logic over an already-open VaultDatabase and an already-authenticated
// supabase-js client — no login, no device-id bookkeeping, no settings
// reads/writes here. Both scripts/sync-push.js / scripts/sync-pull.js (for
// manual/testing use) and main.js (for the real app) call these same two
// functions, so there is exactly one implementation to keep correct.

const CHUNK = 500;
const PAGE = 1000;

// SQLite's datetime('now') is "YYYY-MM-DD HH:MM:SS", UTC, with no timezone
// marker — turn it into an unambiguous ISO string before sending it to a
// Postgres timestamptz column.
function toIso(sqliteDatetime) {
  if (!sqliteDatetime) return null;
  if (sqliteDatetime.includes("T")) return sqliteDatetime;
  return sqliteDatetime.replace(" ", "T") + "Z";
}

// Postgres returns "2026-09-22T01:57:23.123456+00:00" — SQLite's own
// datetime('now')/comparisons expect "YYYY-MM-DD HH:MM:SS". Truncate to the
// same shape so a later push's `updated_at > ?` comparison (plain string
// comparison, same as push already relies on) stays correct.
function toSqlite(isoTimestamp) {
  if (!isoTimestamp) return null;
  return isoTimestamp.replace("T", " ").replace(/\.\d+/, "").replace(/[+-]\d\d:\d\d$/, "").replace("Z", "");
}

// Copies every column from a local row except the ones named here, so the
// upstream field list can't silently drift out of sync with database.js's
// real schema the way a hand-typed allow-list could.
function buildRow(local, exclude, isoFields = []) {
  const row = {};
  for (const [k, v] of Object.entries(local)) {
    if (exclude.has(k)) continue;
    row[k] = v;
  }
  for (const f of isoFields) if (row[f]) row[f] = toIso(row[f]);
  return row;
}

async function upsertChunked(supabase, table, rows, onConflict) {
  if (!rows.length) return 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) throw new Error(`${table} upsert failed at ${i}/${rows.length}: ${error.message}`);
  }
  return rows.length;
}

async function fetchAllSince(supabase, table, since) {
  const all = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select("*")
      .gt("updated_at", since)
      .order("updated_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table} fetch failed: ${error.message}`);
    all.push(...data);
    if (data.length < PAGE) break;
  }
  return all;
}

// Every real media_items column that isn't device-specific (local_path/
// install_path/is_local — see item_locations) or device-local-only
// (cover_art_path — never synced).
// owned_elsewhere is a local-only result of reading the phone's owned marks (see database.js setOwnedElsewhere): never sent.
const ITEM_EXCLUDE = new Set(["id", "local_path", "install_path", "is_local", "cover_art_path", "custom_type_id", "owned_elsewhere"]);
const ITEM_COLUMNS = [
  "title", "media_type", "status", "rating", "date_consumed", "date_added", "notes",
  "creator", "genre", "year", "network", "season_count", "narrator", "platform", "label",
  "runtime", "imdb_url", "video_quality", "series_name", "series_order", "platform_id", "steam_url",
  "metadata_fetched", "player_count", "play_time", "complexity", "bgg_url",
  "country", "language", "cast_list", "critic_rating", "content_rating", "trailer_url",
  "watch_providers", "watch_checked_date", "watch_checked_country", "watch_flatrate", "watch_rent", "watch_buy",
  "metadata_checked_date", "cover_art_checked_date",
  "imdb_rating", "imdb_votes", "rotten_tomatoes_rating", "metacritic_rating", "tmdb_rating", "tmdb_votes",
  "bgg_rating", "bgg_rating_count", "bgg_rank", "anilist_score",
  "hardcover_rating", "hardcover_ratings_count", "hardcover_url",
  "openlibrary_rating", "openlibrary_ratings_count", "ebook_url",
  "discogs_rating", "discogs_ratings_count", "discogs_url", "podcast_url",
  "igdb_url", "igdb_rating", "igdb_rating_count",
  "hltb_main", "hltb_main_extra", "hltb_completionist", "hltb_checked_date",
  "writer", "composer", "studio", "budget", "box_office", "publisher",
  "themes", "game_modes", "player_perspective", "game_engine", "owned_platform", "tags",
  "edition_format", "abridged", "style", "album_type", "copyright", "tracklist",
  "artist", "mechanics", "min_age", "condition", "personal_notes",
  "set_name", "collector_number", "rarity", "type_line", "power_toughness", "format_legality", "mana_cost",
  "chapter_count", "total_volumes", "subscribers", "video_count",
  "system", "recommended_level", "site_name", "url", "episode_count",
  "custom_fields", "is_hidden",
];

// ── push ─────────────────────────────────────────────────────────────────
// Reads every local media_items/lists/custom_types/custom_type_fields row
// changed since `since` (a "YYYY-MM-DD HH:MM:SS" checkpoint) and upserts it
// into Supabase by sync_id, parent-before-child, plus this device's
// item_locations and every current list_items membership (both pushed
// unconditionally — see docs/cloud-sync-design.md). Returns a per-table
// count summary. Throws on any failure; the caller decides whether/when to
// advance its own checkpoint.
async function pushChanges(db, supabase, { userId, deviceId, since, deviceName, devicePlatform }) {
  const counts = {};

  const { error: devErr } = await supabase.from("devices").upsert(
    { device_id: deviceId, user_id: userId, name: deviceName, platform: devicePlatform, last_synced_at: new Date().toISOString() },
    { onConflict: "device_id" }
  );
  if (devErr) throw devErr;

  const customTypes = db.db.prepare(`SELECT * FROM custom_types WHERE updated_at > ?`).all(since);
  counts.custom_types = await upsertChunked(supabase, "custom_types",
    customTypes.map(t => ({ ...buildRow(t, new Set(["id", "created_at"]), ["updated_at"]), user_id: userId, deleted_at: null })),
    "sync_id");

  const fields = db.db.prepare(`
    SELECT ctf.*, ct.sync_id AS custom_type_sync_id
    FROM custom_type_fields ctf
    JOIN custom_types ct ON ct.id = ctf.custom_type_id
    WHERE ctf.updated_at > ?
  `).all(since);
  counts.custom_type_fields = await upsertChunked(supabase, "custom_type_fields",
    fields.map(f => ({ ...buildRow(f, new Set(["id", "custom_type_id"]), ["updated_at"]), deleted_at: null })),
    "sync_id");

  const lists = db.db.prepare(`SELECT * FROM lists WHERE updated_at > ?`).all(since);
  counts.lists = await upsertChunked(supabase, "lists",
    lists.map(l => ({ ...buildRow(l, new Set(["id", "created_at"]), ["updated_at"]), user_id: userId, is_default: !!l.is_default, deleted_at: null })),
    "sync_id");

  // Lists deleted here — tombstoned so other devices delete them too.
  const deletedLists = db.db.prepare(`SELECT * FROM list_tombstones`).all();
  counts.lists_deleted = await upsertChunked(supabase, "lists",
    deletedLists.map(t => ({ sync_id: t.sync_id, user_id: userId, name: t.name, is_default: false, updated_at: toIso(t.deleted_at), deleted_at: toIso(t.deleted_at) })),
    "sync_id");

  // Discovery dismissals — keyed by (user_id, media_type, tmdb_id), so two
  // devices dismissing the same title converge on one row; undismissed rows
  // go up with deleted_at set.
  const dismissed = db.db.prepare(`SELECT * FROM discovery_dismissed WHERE updated_at > ?`).all(since);
  counts.discovery_dismissed = await upsertChunked(supabase, "discovery_dismissed",
    dismissed.map(d => ({
      user_id: userId, media_type: d.media_type, tmdb_id: d.tmdb_id, title: d.title,
      updated_at: toIso(d.updated_at), deleted_at: toIso(d.deleted_at),
    })),
    "user_id,media_type,tmdb_id");

  const items = db.db.prepare(`
    SELECT m.*, ct.sync_id AS custom_type_sync_id,
           (SELECT s.url FROM cover_art_sources s WHERE s.path = m.cover_art_path) AS cover_art_url
    FROM media_items m
    LEFT JOIN custom_types ct ON ct.id = m.custom_type_id
    WHERE m.updated_at > ?
  `).all(since);
  counts.items = await upsertChunked(supabase, "items",
    items.map(m => ({ ...buildRow(m, ITEM_EXCLUDE, ["updated_at", "created_at"]), user_id: userId, deleted_at: null })),
    "sync_id");

  // Items deleted here — soft-deleted in the cloud so the phone and any other
  // device drop them. An UPDATE, not an upsert: the row already exists there
  // and an upsert would need every NOT NULL column again.
  const deletedItems = db.db.prepare(`SELECT * FROM item_tombstones`).all();
  counts.items_deleted = 0;
  for (const t of deletedItems) {
    const { error } = await supabase.from("items")
      .update({ deleted_at: toIso(t.deleted_at), updated_at: toIso(t.deleted_at) })
      .eq("sync_id", t.sync_id);
    if (error) throw new Error(`items delete failed: ${error.message}`);
    counts.items_deleted++;
  }
  db.db.prepare(`DELETE FROM item_tombstones WHERE deleted_at < datetime('now', '-30 days')`).run();

  const withLocation = db.db.prepare(`
    SELECT sync_id, local_path, install_path, is_local FROM media_items
    WHERE local_path IS NOT NULL OR install_path IS NOT NULL OR is_local = 1
  `).all();
  counts.item_locations = await upsertChunked(supabase, "item_locations",
    withLocation.map(m => ({
      item_sync_id: m.sync_id, device_id: deviceId,
      local_path: m.local_path, install_path: m.install_path, is_local: !!m.is_local,
      updated_at: new Date().toISOString(),
    })),
    "item_sync_id,device_id");

  const memberships = db.db.prepare(`
    SELECT l.sync_id AS list_sync_id, m.sync_id AS item_sync_id
    FROM list_items li
    JOIN lists l ON l.id = li.list_id
    JOIN media_items m ON m.id = li.item_id
  `).all();
  counts.list_items = await upsertChunked(supabase, "list_items",
    memberships.map(r => ({ ...r, updated_at: new Date().toISOString(), deleted_at: null })),
    "list_sync_id,item_sync_id");

  // Removals — sent as soft-deleted rows so other devices drop the
  // membership instead of it living on in the cloud.
  const removed = db.db.prepare(`SELECT * FROM list_item_tombstones`).all();
  counts.list_items_removed = await upsertChunked(supabase, "list_items",
    removed.map(t => ({ list_sync_id: t.list_sync_id, item_sync_id: t.item_sync_id, updated_at: toIso(t.deleted_at), deleted_at: toIso(t.deleted_at) })),
    "list_sync_id,item_sync_id");

  // Removal notices only need to outlive every device's next sync — drop
  // old ones so they aren't re-sent forever.
  db.db.prepare(`DELETE FROM list_item_tombstones WHERE deleted_at < datetime('now', '-30 days')`).run();
  db.db.prepare(`DELETE FROM list_tombstones WHERE deleted_at < datetime('now', '-30 days')`).run();

  return counts;
}

// ── pull ─────────────────────────────────────────────────────────────────
// Fetches every cloud row changed since `since` (an ISO timestamp) and
// applies it locally, parent-before-child: a new sync_id is inserted
// (allocating a fresh local id), a known sync_id compares updated_at and
// the newer copy wins, a deleted_at newer than the local row removes it.
// Device-specific columns are never touched by a pull. Returns
// { inserted, updated, skipped, deleted } totals across all tables.
async function pullChanges(db, supabase, since) {
  let inserted = 0, updated = 0, skipped = 0, deleted = 0;
  // {sync_id, url} for every pulled item carrying a cover_art_url — the
  // caller downloads this device's own copy (lib/linkedCoverArt.js).
  const coverArtLinks = [];

  // Every table's changes are fetched up front (in parallel — these are
  // independent reads) so the write side below can run as a single
  // synchronous transaction. Previously each table's writes ran as
  // individual auto-committed statements interleaved with the next table's
  // network fetch: slow (one WAL sync per row across up to thousands of
  // rows) and, on a crash or thrown error partway through, left the local
  // DB with some tables applied and others not — e.g. custom_type_fields
  // committed while the custom_types row it references wasn't.
  const [customTypes, fields, lists, items, dismissals, memberships] = await Promise.all([
    fetchAllSince(supabase, "custom_types", since),
    fetchAllSince(supabase, "custom_type_fields", since),
    fetchAllSince(supabase, "lists", since),
    fetchAllSince(supabase, "items", since),
    fetchAllSince(supabase, "discovery_dismissed", since),
    fetchAllSince(supabase, "list_items", since),
  ]);

  db.db.transaction(() => {

  // custom_types (before custom_type_fields/items, which reference one)
  const customTypeIdBySyncId = new Map();
  for (const row of db.db.prepare(`SELECT id, sync_id FROM custom_types WHERE sync_id IS NOT NULL`).all()) {
    customTypeIdBySyncId.set(row.sync_id, row.id);
  }
  for (const remote of customTypes) {
    const local = db.db.prepare(`SELECT id, updated_at FROM custom_types WHERE sync_id = ?`).get(remote.sync_id);
    if (remote.deleted_at) {
      if (local) { db.db.prepare(`DELETE FROM custom_types WHERE id = ?`).run(local.id); customTypeIdBySyncId.delete(remote.sync_id); deleted++; }
      continue;
    }
    if (!local) {
      const result = db.db.prepare(`
        INSERT INTO custom_types (label, icon, color, sync_id, updated_at) VALUES (?, ?, ?, ?, ?)
      `).run(remote.label, remote.icon, remote.color, remote.sync_id, toSqlite(remote.updated_at));
      customTypeIdBySyncId.set(remote.sync_id, result.lastInsertRowid);
      inserted++;
    } else if (toSqlite(remote.updated_at) > local.updated_at) {
      db.db.prepare(`UPDATE custom_types SET label = ?, icon = ?, color = ?, updated_at = ? WHERE id = ?`)
        .run(remote.label, remote.icon, remote.color, toSqlite(remote.updated_at), local.id);
      updated++;
    } else skipped++;
  }

  // custom_type_fields
  for (const remote of fields) {
    const typeId = customTypeIdBySyncId.get(remote.custom_type_sync_id);
    if (!typeId) { skipped++; continue; }
    const local = db.db.prepare(`SELECT id, updated_at FROM custom_type_fields WHERE sync_id = ?`).get(remote.sync_id);
    if (remote.deleted_at) {
      if (local) { db.db.prepare(`DELETE FROM custom_type_fields WHERE id = ?`).run(local.id); deleted++; }
      continue;
    }
    if (!local) {
      db.db.prepare(`
        INSERT INTO custom_type_fields (custom_type_id, key, label, field_type, sort_order, sync_id, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(typeId, remote.key, remote.label, remote.field_type, remote.sort_order, remote.sync_id, toSqlite(remote.updated_at));
      inserted++;
    } else if (toSqlite(remote.updated_at) > local.updated_at) {
      db.db.prepare(`UPDATE custom_type_fields SET key = ?, label = ?, field_type = ?, sort_order = ?, updated_at = ? WHERE id = ?`)
        .run(remote.key, remote.label, remote.field_type, remote.sort_order, toSqlite(remote.updated_at), local.id);
      updated++;
    } else skipped++;
  }

  // lists
  const listIdBySyncId = new Map();
  for (const row of db.db.prepare(`SELECT id, sync_id FROM lists WHERE sync_id IS NOT NULL`).all()) {
    listIdBySyncId.set(row.sync_id, row.id);
  }
  for (const remote of lists) {
    const local = db.db.prepare(`SELECT id, updated_at, is_default FROM lists WHERE sync_id = ?`).get(remote.sync_id);
    if (remote.deleted_at) {
      if (local && !local.is_default) { db.db.prepare(`DELETE FROM lists WHERE id = ?`).run(local.id); listIdBySyncId.delete(remote.sync_id); deleted++; }
      continue;
    }
    // Favourites always exists locally already — _seedDefaults() creates it
    // (with its own, locally-generated sync_id) on every fresh install,
    // before this device has ever synced. Relink this device's Favourites
    // row onto the cloud's sync_id for it rather than trying to create a
    // second row, which would violate the name UNIQUE constraint — always
    // relink by is_default here, regardless of whether the local row
    // already carries some other (never-pushed) sync_id of its own.
    const existingDefault = !local && remote.is_default
      ? db.db.prepare(`SELECT id, sync_id, updated_at FROM lists WHERE is_default = 1`).get()
      : null;
    if (!local && existingDefault) {
      db.db.prepare(`UPDATE lists SET sync_id = ?, updated_at = ? WHERE id = ?`)
        .run(remote.sync_id, toSqlite(remote.updated_at), existingDefault.id);
      listIdBySyncId.set(remote.sync_id, existingDefault.id);
      updated++;
    } else if (!local) {
      // List names are unique (case-insensitive) locally. Two devices can
      // create a same-named list independently — adopt the remote identity
      // onto a local list that never synced, otherwise skip the newcomer
      // rather than let the UNIQUE constraint abort the whole pull.
      const sameName = db.db.prepare(`SELECT id, sync_id FROM lists WHERE name = ? COLLATE NOCASE`).get(remote.name);
      if (sameName) {
        if (!sameName.sync_id) {
          db.db.prepare(`UPDATE lists SET sync_id = ?, updated_at = ? WHERE id = ?`).run(remote.sync_id, toSqlite(remote.updated_at), sameName.id);
          listIdBySyncId.set(remote.sync_id, sameName.id);
          updated++;
        } else skipped++;
        continue;
      }
      const result = db.db.prepare(`
        INSERT INTO lists (name, is_default, sync_id, updated_at) VALUES (?, ?, ?, ?)
      `).run(remote.name, remote.is_default ? 1 : 0, remote.sync_id, toSqlite(remote.updated_at));
      listIdBySyncId.set(remote.sync_id, result.lastInsertRowid);
      inserted++;
    } else if (toSqlite(remote.updated_at) > local.updated_at) {
      db.db.prepare(`UPDATE lists SET name = ?, updated_at = ? WHERE id = ?`)
        .run(remote.name, toSqlite(remote.updated_at), local.id);
      updated++;
    } else skipped++;
  }

  // items
  const insertItemStmt = db.db.prepare(`
    INSERT INTO media_items (${ITEM_COLUMNS.join(", ")}, custom_type_id, sync_id, created_at, updated_at)
    VALUES (${ITEM_COLUMNS.map(c => "@" + c).join(", ")}, @custom_type_id, @sync_id, @created_at, @updated_at)
  `);
  const updateItemStmt = db.db.prepare(`
    UPDATE media_items SET ${ITEM_COLUMNS.map(c => `${c} = @${c}`).join(", ")}, custom_type_id = @custom_type_id, updated_at = @updated_at
    WHERE id = @id
  `);
  for (const remote of items) {
    const local = db.db.prepare(`SELECT id, updated_at FROM media_items WHERE sync_id = ?`).get(remote.sync_id);
    if (remote.deleted_at) {
      if (local) { db.db.prepare(`DELETE FROM media_items WHERE id = ?`).run(local.id); deleted++; }
      continue;
    }
    if (remote.cover_art_url) coverArtLinks.push({ sync_id: remote.sync_id, url: remote.cover_art_url });
    // An item deleted HERE that the cloud still holds alive (the deletion
    // hasn't uploaded yet) must not be re-created by this pull — unless it
    // was edited elsewhere after the deletion, in which case it's back.
    if (!local) {
      const tomb = db.db.prepare(`SELECT deleted_at FROM item_tombstones WHERE sync_id = ?`).get(remote.sync_id);
      if (tomb) {
        if (toSqlite(remote.updated_at) <= tomb.deleted_at) { skipped++; continue; }
        db.db.prepare(`DELETE FROM item_tombstones WHERE sync_id = ?`).run(remote.sync_id);
      }
    }
    const params = {};
    for (const c of ITEM_COLUMNS) params[c] = remote[c] ?? null;
    params.custom_type_id = remote.custom_type_sync_id ? (customTypeIdBySyncId.get(remote.custom_type_sync_id) ?? null) : null;
    params.sync_id = remote.sync_id;
    params.created_at = toSqlite(remote.created_at);
    params.updated_at = toSqlite(remote.updated_at);
    if (!local) {
      insertItemStmt.run(params);
      inserted++;
    } else if (toSqlite(remote.updated_at) > local.updated_at) {
      updateItemStmt.run({ ...params, id: local.id });
      updated++;
    } else skipped++;
  }

  // discovery dismissals — last-write-wins on the natural key. A remote
  // tombstone for a title we never had is skipped rather than inserted.
  for (const remote of dismissals) {
    const local = db.db.prepare(`SELECT id, updated_at FROM discovery_dismissed WHERE media_type = ? AND tmdb_id = ?`)
      .get(remote.media_type, remote.tmdb_id);
    const remoteAt = toSqlite(remote.updated_at);
    const deletedAt = remote.deleted_at ? toSqlite(remote.deleted_at) : null;
    if (!local) {
      if (deletedAt) { skipped++; continue; }
      db.db.prepare(`INSERT INTO discovery_dismissed (media_type, tmdb_id, title, dismissed_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)`)
        .run(remote.media_type, remote.tmdb_id, remote.title, remoteAt, remoteAt);
      inserted++;
    } else if (remoteAt > local.updated_at) {
      db.db.prepare(`UPDATE discovery_dismissed SET title = COALESCE(?, title), deleted_at = ?, updated_at = ? WHERE id = ?`)
        .run(remote.title, deletedAt, remoteAt, local.id);
      updated++;
    } else skipped++;
  }

  // list_items — no local updated_at exists on this junction table (see the
  // design doc); every fetched-since membership is simply applied.
  const itemIdBySyncId = new Map();
  for (const row of db.db.prepare(`SELECT id, sync_id FROM media_items WHERE sync_id IS NOT NULL`).all()) {
    itemIdBySyncId.set(row.sync_id, row.id);
  }
  for (const remote of memberships) {
    const listId = listIdBySyncId.get(remote.list_sync_id);
    const itemId = itemIdBySyncId.get(remote.item_sync_id);
    if (!listId || !itemId) { skipped++; continue; }
    if (remote.deleted_at) {
      db.db.prepare(`DELETE FROM list_items WHERE list_id = ? AND item_id = ?`).run(listId, itemId);
    } else {
      // A removal made on THIS device that hasn't reached the cloud yet must
      // not be undone by the cloud's older "still a member" row.
      const tomb = db.db.prepare(`SELECT deleted_at FROM list_item_tombstones WHERE list_sync_id = ? AND item_sync_id = ?`)
        .get(remote.list_sync_id, remote.item_sync_id);
      if (tomb && toSqlite(remote.updated_at) <= tomb.deleted_at) continue;
      db.db.prepare(`INSERT OR IGNORE INTO list_items (list_id, item_id) VALUES (?, ?)`).run(listId, itemId);
      if (tomb) db.db.prepare(`DELETE FROM list_item_tombstones WHERE list_sync_id = ? AND item_sync_id = ?`).run(remote.list_sync_id, remote.item_sync_id);
    }
  }

  })(); // end db.db.transaction

  return { inserted, updated, skipped, deleted, coverArtLinks };
}

// Which items another of the user's devices (the phone) has marked owned. Read from
// the item_locations rows every device writes (is_local = owned there); this device's
// own rows are left out, since its is_local already says it. Best effort: a failure
// leaves what was there. Returns how many items changed.
async function pullRemoteOwnership(db, supabase, deviceId) {
  const owned = new Set();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("item_locations").select("item_sync_id")
      .eq("is_local", true).neq("device_id", deviceId)
      .range(from, from + 999);
    if (error) throw error;
    for (const r of data) owned.add(r.item_sync_id);
    if (data.length < 1000) break;
  }
  return db.setOwnedElsewhere([...owned]);
}

module.exports = { pushChanges, pullChanges, pullRemoteOwnership, toIso, toSqlite, ITEM_EXCLUDE };
