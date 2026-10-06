// Lists (Favourites plus the user's own) through Supabase — the same `lists`
// and `list_items` tables Cloud Sync carries to desktop. Removing an item
// from a list is a soft delete (deleted_at), which is how desktop learns to
// drop it too. Every function throws on failure (e.g. offline) so callers
// can say so instead of pretending it saved.
import { supabase } from "./supabase";
import { uuidv4 } from "./addToLibrary";

export async function fetchLists() {
  const { data, error } = await supabase
    .from("lists")
    .select("sync_id, name, is_default")
    .is("deleted_at", null);
  if (error) throw error;
  // Favourites first, then alphabetical — same order desktop shows them.
  return [...data].sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

// Every live membership, as Map(item sync_id -> [list sync_id, ...]) — what
// the Library's List filter reads. Paged like the item list (a Supabase query
// returns at most 1000 rows).
export async function fetchAllMemberships() {
  const map = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("list_items")
      .select("list_sync_id, item_sync_id")
      .is("deleted_at", null)
      .range(from, from + 999);
    if (error) throw error;
    for (const r of data) {
      if (!map.has(r.item_sync_id)) map.set(r.item_sync_id, []);
      map.get(r.item_sync_id).push(r.list_sync_id);
    }
    if (data.length < 1000) break;
  }
  return map;
}

// Set of list sync_ids this item is currently a member of.
export async function fetchMemberships(itemSyncId) {
  const { data, error } = await supabase
    .from("list_items")
    .select("list_sync_id")
    .eq("item_sync_id", itemSyncId)
    .is("deleted_at", null);
  if (error) throw error;
  return new Set(data.map((r) => r.list_sync_id));
}

export async function setMembership(listSyncId, itemSyncId, member) {
  const now = new Date().toISOString();
  const row = { list_sync_id: listSyncId, item_sync_id: itemSyncId, updated_at: now, deleted_at: member ? null : now };
  const { error } = await supabase.from("list_items").upsert(row, { onConflict: "list_sync_id,item_sync_id" });
  if (error) throw error;
}

// List names are unique (case-insensitive) on desktop, so refuse a
// duplicate here rather than creating one desktop can't hold.
export async function createList(name, existingLists) {
  const trimmed = (name || "").trim();
  if (!trimmed) throw new Error("List name can't be empty.");
  if (existingLists.some((l) => l.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error(`A list named "${trimmed}" already exists.`);
  }
  const { data: auth } = await supabase.auth.getUser();
  const row = { sync_id: uuidv4(), user_id: auth.user.id, name: trimmed, is_default: false, updated_at: new Date().toISOString() };
  const { error } = await supabase.from("lists").insert(row);
  if (error) throw error;
  return { sync_id: row.sync_id, name: row.name, is_default: false };
}
