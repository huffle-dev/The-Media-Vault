// Custom media types on the phone. They are made on desktop (a label, icon,
// colour and a list of extra fields) and synced as `custom_types` and
// `custom_type_fields`; an item of one has media_type "Custom", a
// custom_type_sync_id, and its extra values in `custom_fields` (a JSON string).
//
// Desktop's shared helpers (effectiveType, getEffectiveTypeConfig,
// withCustomTypeTabs) identify a custom type by `custom_type_id`, so on the phone
// that id IS the type's sync_id: `withCustomTypeId` copies it across. Pure — the
// Supabase client is passed in — so test/mobileCustomTypes.test.js runs without Expo.

export const FIELD_TYPES = ["text", "number", "url", "checkbox", "date"];

// Types with their fields attached, oldest field order first:
// [{ id, sync_id, label, icon, color, fields: [{ sync_id, key, label, field_type }] }]
export async function fetchCustomTypes(client) {
  const [types, fields] = await Promise.all([
    client.from("custom_types").select("sync_id, label, icon, color").is("deleted_at", null).order("label", { ascending: true }),
    client.from("custom_type_fields").select("sync_id, custom_type_sync_id, key, label, field_type, sort_order").is("deleted_at", null).order("sort_order", { ascending: true }),
  ]);
  if (types.error) throw types.error;
  if (fields.error) throw fields.error;
  const byType = new Map();
  for (const f of fields.data || []) {
    if (!byType.has(f.custom_type_sync_id)) byType.set(f.custom_type_sync_id, []);
    byType.get(f.custom_type_sync_id).push({ sync_id: f.sync_id, key: f.key, label: f.label, field_type: FIELD_TYPES.includes(f.field_type) ? f.field_type : "text" });
  }
  return (types.data || []).map((t) => ({ ...t, id: t.sync_id, fields: byType.get(t.sync_id) || [] }));
}

// An item with desktop's `custom_type_id` filled from its sync id (same object back when it has none).
export function withCustomTypeId(item) {
  return item && item.custom_type_sync_id && item.custom_type_id !== item.custom_type_sync_id
    ? { ...item, custom_type_id: item.custom_type_sync_id }
    : item;
}

// The item's extra values as an object ({} when missing or damaged).
export function parseCustomFields(raw) {
  if (!raw) return {};
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// How a stored value reads on the profile (empty for no value).
export function customValueText(field, value) {
  if (value === null || value === undefined || value === "") return "";
  if (field.field_type === "checkbox") return value === true || value === 1 || value === "1" || value === "true" ? "Yes" : "No";
  return String(value);
}

// The text an input starts with for a stored value.
export function customInputText(field, value) {
  if (value === null || value === undefined) return "";
  if (field.field_type === "checkbox") return value === true || value === 1 || value === "1" || value === "true" ? "1" : "0";
  return String(value);
}

// Input text -> stored value; throws a readable Error for a bad number, date or link.
export function parseCustomInput(field, text) {
  const t = String(text ?? "").trim();
  if (field.field_type === "checkbox") return t === "1";
  if (t === "") return null;
  if (field.field_type === "number") {
    const n = Number(t);
    if (!Number.isFinite(n)) throw new Error(`${field.label} must be a number.`);
    return n;
  }
  if (field.field_type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(t)) throw new Error(`${field.label} must be a date like 2026-10-05.`);
  if (field.field_type === "url" && !/^https?:\/\//i.test(t)) throw new Error(`${field.label} must start with http:// or https://.`);
  return t;
}

// The custom_fields JSON string to save: the item's existing values with these
// changes laid over them (so a value the phone doesn't know about is kept).
export function buildCustomFieldsJson(existing, fields, texts) {
  const out = { ...parseCustomFields(existing) };
  for (const f of fields) {
    const value = parseCustomInput(f, texts[f.key]);
    if (value === null || value === false) delete out[f.key]; else out[f.key] = value;
  }
  return Object.keys(out).length ? JSON.stringify(out) : null;
}
