// "Not interested" picks in Discover, synced through Supabase (the
// discovery_dismissed table — see supabase/schema_v5_discovery_dismissed.sql)
// so a title dismissed on desktop or here stays dismissed on both. A copy is
// kept on the phone so Discover still filters correctly offline.
//
// Same {media_type, tmdb_id, title} shape desktop's recommendation functions
// take, so they can be passed in unchanged. tmdb_id is really "external
// source id" — a TMDB id for Movie/TV, an Open Library work key for Book.
import { File, Paths } from "expo-file-system";
import { supabase } from "./supabase";

const file = new File(Paths.document, "discovery-dismissed.json");

function saveLocal(list) {
  try {
    if (!file.exists) file.create();
    file.write(JSON.stringify(list));
  } catch { /* best-effort */ }
}

async function loadLocal() {
  try {
    if (!file.exists) return [];
    const parsed = JSON.parse(await file.text());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearDismissals() {
  try { if (file.exists) file.delete(); } catch { /* nothing to clear */ }
}

// Live list from Supabase (tombstoned rows excluded), falling back to the
// saved copy when there's no connection.
export async function loadDismissals() {
  const { data, error } = await supabase
    .from("discovery_dismissed")
    .select("media_type, tmdb_id, title")
    .is("deleted_at", null);
  if (error || !data) return loadLocal();
  saveLocal(data);
  return data;
}

// Throws on failure (e.g. offline) so the caller can say so instead of
// pretending the dismissal saved. Returns the updated list.
export async function addDismissal(current, mediaType, id, title) {
  const { data: auth } = await supabase.auth.getUser();
  const row = {
    user_id: auth.user.id, media_type: mediaType, tmdb_id: String(id), title: title || null,
    updated_at: new Date().toISOString(), deleted_at: null,
  };
  const { error } = await supabase.from("discovery_dismissed").upsert(row, { onConflict: "user_id,media_type,tmdb_id" });
  if (error) throw error;
  const next = [...current.filter((d) => !(d.media_type === mediaType && d.tmdb_id === String(id))),
    { media_type: mediaType, tmdb_id: String(id), title: title || null }];
  saveLocal(next);
  return next;
}

// Undo — a soft delete, so other devices un-dismiss too. Throws on failure.
export async function removeDismissal(current, mediaType, id) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("discovery_dismissed")
    .update({ deleted_at: now, updated_at: now })
    .eq("media_type", mediaType).eq("tmdb_id", String(id));
  if (error) throw error;
  const next = current.filter((d) => !(d.media_type === mediaType && d.tmdb_id === String(id)));
  saveLocal(next);
  return next;
}
