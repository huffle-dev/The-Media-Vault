// Acting on several library items at once (the Library's long-press selection
// mode): set their status, hide / unhide, add to a list, or delete. Every
// action returns { message, undo, failed } — `undo` puts things back the way
// they were (the Library offers it for ten seconds), `failed` counts items
// whose write didn't go through.
//
// The Supabase client is passed IN, not imported, so this file has no Expo
// dependencies and test/mobileBulkActions.test.js can drive it with a fake.
// Writes go by sync_id straight to Supabase like every other phone edit, and
// stamp updated_at so Cloud Sync carries them to desktop.
import { buildStatusChangePatch } from "@media-vault/core/tokens/ratings.js";
import { ensureDevice, writeOwned, ownedStatusPatch } from "./ownership.js";

const CHUNK = 100;       // sync_ids per ".in(...)" request (keeps the URL short)
const CONCURRENCY = 6;   // parallel single-item writes (status changes differ per item)

export const chunk = (list, size = CHUNK) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

// Runs `worker` over `list` with at most `limit` in flight; resolves to the
// items whose worker threw (never rejects, so one bad write can't hide the rest).
export async function runLimited(list, worker, limit = CONCURRENCY) {
  const failed = [];
  let next = 0;
  const lane = async () => {
    while (next < list.length) {
      const item = list[next++];
      try { await worker(item); } catch { failed.push(item); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, lane));
  return failed;
}

const plural = (n, word = "item") => `${n} ${word}${n === 1 ? "" : "s"}`;
const stamp = () => new Date().toISOString();

// The selected rows, in selection order, from the loaded library list.
const rowsFor = (items, ids) => {
  const bySyncId = new Map((items || []).map((i) => [i.sync_id, i]));
  return ids.map((id) => bySyncId.get(id)).filter(Boolean);
};

async function updateIds(client, ids, patch) {
  const failed = [];
  for (const part of chunk(ids)) {
    const { error } = await client.from("items").update({ ...patch, updated_at: stamp() }).in("sync_id", part);
    if (error) failed.push(...part);
  }
  return failed;
}

// ── status ───────────────────────────────────────────────────────────────────
// Each item gets desktop's own status rule (buildStatusChangePatch: leaving
// Completed/Dropped clears the rating, entering one stamps today's date), so
// the patch differs per item and is written one item at a time.
export async function bulkSetStatus(client, items, ids, status, statusText = status) {
  const rows = rowsFor(items, ids);
  const before = new Map(rows.map((r) => [r.sync_id, { status: r.status, rating: r.rating ?? null, date_consumed: r.date_consumed ?? null }]));
  const failed = await runLimited(rows, async (row) => {
    const { error } = await client.from("items").update({ ...buildStatusChangePatch(row, status), updated_at: stamp() }).eq("sync_id", row.sync_id);
    if (error) throw error;
  });
  const failedIds = new Set(failed.map((r) => r.sync_id));
  const done = rows.filter((r) => !failedIds.has(r.sync_id));
  return {
    message: `${plural(done.length)} set to ${statusText}`,
    failed: failed.length,
    undo: async () => runLimited(done, async (row) => {
      const { error } = await client.from("items").update({ ...before.get(row.sync_id), updated_at: stamp() }).eq("sync_id", row.sync_id);
      if (error) throw error;
    }),
  };
}

// ── hide / unhide ────────────────────────────────────────────────────────────
export async function bulkSetHidden(client, items, ids, hidden) {
  const rows = rowsFor(items, ids);
  const wasHidden = new Set(rows.filter((r) => r.is_hidden === 1 || r.is_hidden === true).map((r) => r.sync_id));
  const failedIds = new Set(await updateIds(client, rows.map((r) => r.sync_id), { is_hidden: hidden ? 1 : 0 }));
  const done = rows.map((r) => r.sync_id).filter((id) => !failedIds.has(id));
  return {
    message: `${plural(done.length)} ${hidden ? "hidden" : "unhidden"}`,
    failed: failedIds.size,
    undo: async () => {
      await updateIds(client, done.filter((id) => wasHidden.has(id)), { is_hidden: 1 });
      await updateIds(client, done.filter((id) => !wasHidden.has(id)), { is_hidden: 0 });
    },
  };
}

// ── delete (soft: deleted_at, which is how desktop learns to drop it) ────────
export async function bulkDelete(client, items, ids) {
  const rows = rowsFor(items, ids);
  const syncIds = rows.map((r) => r.sync_id);
  const failedIds = new Set(await updateIds(client, syncIds, { deleted_at: stamp() }));
  const done = syncIds.filter((id) => !failedIds.has(id));
  return {
    message: `${plural(done.length)} deleted`,
    failed: failedIds.size,
    undo: async () => { await updateIds(client, done, { deleted_at: null }); },
  };
}

// ── add to a list ────────────────────────────────────────────────────────────
// `listIdsByItem` is the library's Map(item sync_id -> [list sync_id]); items
// already on the list are left alone (and left on it when undoing).
export async function bulkAddToList(client, listIdsByItem, listSyncId, ids, listName = "the list") {
  const toAdd = ids.filter((id) => !(listIdsByItem.get(id) || []).includes(listSyncId));
  const now = stamp();
  let failed = 0;
  const added = [];
  for (const part of chunk(toAdd)) {
    const rows = part.map((id) => ({ list_sync_id: listSyncId, item_sync_id: id, updated_at: now, deleted_at: null }));
    const { error } = await client.from("list_items").upsert(rows, { onConflict: "list_sync_id,item_sync_id" });
    if (error) failed += part.length; else added.push(...part);
  }
  const already = ids.length - toAdd.length;
  return {
    message: added.length === 0 && already > 0
      ? `Already on ${listName}`
      : `${plural(added.length)} added to ${listName}${already ? ` (${already} already there)` : ""}`,
    failed,
    undo: async () => {
      const when = stamp();
      for (const part of chunk(added)) {
        await client.from("list_items").upsert(
          part.map((id) => ({ list_sync_id: listSyncId, item_sync_id: id, updated_at: when, deleted_at: when })),
          { onConflict: "list_sync_id,item_sync_id" },
        );
      }
    },
  };
}

// ── owned (this phone's own mark; no file path, nothing to open) ─────────────
// `ctx`: { deviceId, phoneOwnedIds (Set: marked on this phone), otherOwnedIds (Set: marked on any other device) }.
// Wishlist <-> Not Started follows the change, like desktop. Undo puts the marks and statuses back.
export async function bulkSetOwned(client, items, ids, owned, ctx) {
  const rows = rowsFor(items, ids);
  const { deviceId, otherOwnedIds = new Set(), phoneOwnedIds = new Set() } = ctx;
  await ensureDevice(client, deviceId);
  const failedIds = new Set(await writeOwned(client, { deviceId, ids: rows.map((r) => r.sync_id), owned }));
  const done = rows.filter((r) => !failedIds.has(r.sync_id));
  const statusBefore = new Map();
  await runLimited(done, async (row) => {
    const patch = ownedStatusPatch(row, owned, otherOwnedIds.has(row.sync_id));
    if (!patch) return;
    const { error } = await client.from("items").update({ ...patch, updated_at: stamp() }).eq("sync_id", row.sync_id);
    if (error) throw error;
    statusBefore.set(row.sync_id, row.status);
  });
  return {
    message: `${plural(done.length)} marked ${owned ? "owned" : "not owned on this phone"}`,
    failed: failedIds.size,
    undo: async () => {
      const wasMine = done.filter((r) => phoneOwnedIds.has(r.sync_id)).map((r) => r.sync_id);
      const wasNot = done.filter((r) => !phoneOwnedIds.has(r.sync_id)).map((r) => r.sync_id);
      await writeOwned(client, { deviceId, ids: wasMine, owned: true });
      await writeOwned(client, { deviceId, ids: wasNot, owned: false });
      await runLimited([...statusBefore], async ([id, status]) => {
        const { error } = await client.from("items").update({ status, updated_at: stamp() }).eq("sync_id", id);
        if (error) throw error;
      });
    },
  };
}
