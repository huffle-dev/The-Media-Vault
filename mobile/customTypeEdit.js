// Creating, changing and deleting a custom media type from the phone (desktop's Custom
// Type Builder). A type is a label, an icon, a colour and a list of extra fields; it
// syncs as `custom_types` and `custom_type_fields` rows, which desktop pulls. Pure — the
// Supabase client and the id maker are passed in — so test/mobileCustomTypeEdit.test.js
// runs without Expo.
import { uniqueKey } from "@media-vault/core/customTypeKeys.js";
import { FIELD_TYPES } from "./customTypes";

export const ICON_CHOICES = ["💿", "🍷", "🧸", "⛏️", "💎", "🕹️", "🖼️", "🧩", "🪙", "🧵", "📻", "🔭"];
export const COLOR_CHOICES = ["#d4a017", "#60a5fa", "#f87171", "#4ade80", "#c084fc", "#fb923c", "#4be8c8", "#f472b6"];
export { FIELD_TYPES };

export const emptyForm = () => ({ sync_id: null, label: "", icon: ICON_CHOICES[0], color: COLOR_CHOICES[0], fields: [] });

// A form from an existing type (fields keep their sync id and key, so values already saved
// on items stay attached).
export const formFromType = (type) => ({
  sync_id: type.sync_id, label: type.label, icon: type.icon, color: type.color,
  fields: type.fields.map((f) => ({ sync_id: f.sync_id, key: f.key, label: f.label, field_type: f.field_type })),
});

export const newField = (existingKeys) => ({ sync_id: null, key: uniqueKey("Field", existingKeys), label: "", field_type: "text" });

// A readable problem, or null when the form can be saved. `otherLabels` = the other types' labels.
export function validateTypeForm(form, otherLabels = []) {
  const label = form.label.trim();
  if (!label) return "Give the type a name.";
  if (otherLabels.some((l) => l.trim().toLowerCase() === label.toLowerCase())) return `You already have a type called "${label}".`;
  if (!form.icon.trim()) return "Pick an icon.";
  if (!/^#[0-9a-fA-F]{6}$/.test(form.color)) return "Pick a colour.";
  for (const f of form.fields) {
    if (!f.label.trim()) return "Every field needs a name (or remove the empty one).";
    if (!FIELD_TYPES.includes(f.field_type)) return `"${f.label}" has an unknown kind.`;
  }
  return null;
}

// Gives a field its key from its label the first time (a field that already has values keeps its key).
export const keyForNewLabel = (label, otherKeys) => uniqueKey(label, otherKeys);

// Saves the type and its fields; returns the type's sync id. Fields no longer in the form are
// marked deleted (so desktop removes them), the others are updated in place or added.
export async function saveCustomType(client, { userId, form, existing, makeId }) {
  const now = new Date().toISOString();
  const typeId = form.sync_id || makeId();
  const { error } = await client.from("custom_types").upsert(
    { sync_id: typeId, user_id: userId, label: form.label.trim(), icon: form.icon.trim(), color: form.color, updated_at: now, deleted_at: null },
    { onConflict: "sync_id" },
  );
  if (error) throw new Error(error.message);

  const keep = new Set(form.fields.map((f) => f.sync_id).filter(Boolean));
  const rows = form.fields.map((f, i) => ({
    sync_id: f.sync_id || makeId(), custom_type_sync_id: typeId, key: f.key, label: f.label.trim(),
    field_type: f.field_type, sort_order: i, updated_at: now, deleted_at: null,
  }));
  const gone = ((existing && existing.fields) || []).filter((f) => !keep.has(f.sync_id));
  const removed = gone.map((f) => ({ sync_id: f.sync_id, custom_type_sync_id: typeId, key: f.key, label: f.label, field_type: f.field_type, sort_order: 0, updated_at: now, deleted_at: now }));
  if (rows.length || removed.length) {
    const { error: e } = await client.from("custom_type_fields").upsert([...rows, ...removed], { onConflict: "sync_id" });
    if (e) throw new Error(e.message);
  }
  return typeId;
}

// Desktop's rule: a type that items still use cannot be deleted.
export async function deleteCustomType(client, type, itemCount) {
  if (itemCount > 0) throw new Error(`${itemCount} item${itemCount === 1 ? "" : "s"} still use this type — delete or re-type ${itemCount === 1 ? "it" : "them"} first.`);
  const now = new Date().toISOString();
  const { error } = await client.from("custom_types").update({ deleted_at: now, updated_at: now }).eq("sync_id", type.sync_id);
  if (error) throw new Error(error.message);
  if (type.fields.length) {
    const { error: e } = await client.from("custom_type_fields").update({ deleted_at: now, updated_at: now }).eq("custom_type_sync_id", type.sync_id);
    if (e) throw new Error(e.message);
  }
}
