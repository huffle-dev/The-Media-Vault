// Which fields the phone lets you edit for an item, and how their text is
// turned back into the value the items table stores. The field lists come
// straight from desktop's TYPE_FIELDS (packages/core/tokens/mediaTypes.js),
// so an item edits the same fields on both apps.
import { TYPE_FIELDS } from "@media-vault/core/tokens/mediaTypes.js";

// Column types in supabase/schema_v2_cloud_sync.sql, for the editable fields.
const INT_FIELDS = new Set(["year", "runtime", "season_count", "episode_count", "video_count", "min_age", "play_time"]);
const FLOAT_FIELDS = new Set(["series_order", "complexity"]);
const BOOL_FIELDS = new Set(["abridged"]); // stored as 0/1

// Not edited on the phone: cast_list holds richer JSON (photos, characters)
// that a plain text box would flatten.
const SKIP = new Set(["cast_list"]);

export const fieldsFor = (mediaType) => (TYPE_FIELDS[mediaType] || []).filter((f) => !SKIP.has(f.key));

export const isBoolField = (key) => BOOL_FIELDS.has(key);
export const keyboardFor = (key) => (INT_FIELDS.has(key) ? "number-pad" : FLOAT_FIELDS.has(key) ? "decimal-pad" : "default");

// The text to show in an input for a stored value.
export const toInputText = (key, value) => {
  if (value === null || value === undefined) return "";
  if (BOOL_FIELDS.has(key)) return value ? "1" : "0";
  return String(value);
};

// Text from an input -> the value to store. Throws a readable Error for a
// number that isn't one. Empty text means "no value" (null).
export function parseFieldValue(key, text, label) {
  const t = String(text ?? "").trim();
  if (BOOL_FIELDS.has(key)) return t === "1" ? 1 : 0;
  if (t === "") return null;
  if (INT_FIELDS.has(key)) {
    if (!/^-?\d+$/.test(t)) throw new Error(`${label} must be a whole number.`);
    return parseInt(t, 10);
  }
  if (FLOAT_FIELDS.has(key)) {
    const n = Number(t);
    if (!Number.isFinite(n)) throw new Error(`${label} must be a number.`);
    return n;
  }
  return t;
}
