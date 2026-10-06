// Writes to a single existing item: edits and deletion, straight to Supabase
// by sync_id (Cloud Sync carries them to desktop). Both throw on failure —
// e.g. offline — so the caller can say so.
import { supabase } from "./supabase";
import { deleteItemCache, saveItemCache } from "./libraryCache";
import { previousValues } from "./itemUndo";

export async function updateItem(item, patch) {
  const full = { ...patch, updated_at: new Date().toISOString() };
  const { error } = await supabase.from("items").update(full).eq("sync_id", item.sync_id);
  if (error) throw error;
  saveItemCache({ ...item, ...full });
  // Puts the old values back (the caller offers it as Undo).
  const before = previousValues(item, patch);
  return async () => {
    const restore = { ...before, updated_at: new Date().toISOString() };
    const { error: e } = await supabase.from("items").update(restore).eq("sync_id", item.sync_id);
    if (e) throw e;
    saveItemCache({ ...item, ...restore });
  };
}

// Soft delete (deleted_at) — that's how desktop learns to drop it too.
// Returns an undo that brings it back.
export async function deleteItem(syncId, item) {
  const now = new Date().toISOString();
  const { error } = await supabase.from("items").update({ deleted_at: now, updated_at: now }).eq("sync_id", syncId);
  if (error) throw error;
  deleteItemCache(syncId);
  return async () => {
    const { error: e } = await supabase.from("items").update({ deleted_at: null, updated_at: new Date().toISOString() }).eq("sync_id", syncId);
    if (e) throw e;
    if (item) saveItemCache({ ...item, deleted_at: null });
  };
}
