// How a custom type's field gets its storage key: the label made lowercase with
// underscores ("Vinyl color" -> "vinyl_color"), made unique within its type. The key is
// what an item's custom_fields JSON is keyed by, so it must stay put once values exist.
// Shared by desktop's Custom Type Builder and the phone's editor.

export const slugify = (label) =>
  String(label || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "field";

export const uniqueKey = (label, existingKeys) => {
  const base = slugify(label);
  let key = base;
  let i = 2;
  while (existingKeys.includes(key)) key = `${base}_${i++}`;
  return key;
};
