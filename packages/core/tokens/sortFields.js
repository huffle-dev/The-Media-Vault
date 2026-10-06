// The sort choices grouped as a field plus a direction, for the phone's Sort sheet (the desktop keeps its
// single drop-down list of SORT_OPTIONS). Every pair maps to exactly one SORT_OPTIONS value, which is what
// sortItems() understands, so nothing about how items are ordered changes.
//
// Direction: "desc" is the "↓" options (newest, highest, last-to-first), "asc" the "↑" ones (and A–Z).

// kind decides the wording of the direction buttons.
export const SORT_FIELDS = [
  { key: "recent", label: "Recently added", kind: "single", options: { desc: "Recently Added" } },
  { key: "added",  label: "Date added",     kind: "date",   options: { desc: "Date Added ↓", asc: "Date Added ↑" } },
  { key: "title",  label: "Title",          kind: "text",   options: { asc: "A–Z", desc: "Z–A" } },
  { key: "rating", label: "Your rating",    kind: "number", options: { desc: "Rating ↓", asc: "Rating ↑" } },
  { key: "critic", label: "Critic rating",  kind: "number", options: { desc: "Critic Rating ↓", asc: "Critic Rating ↑" } },
  { key: "year",   label: "Year",           kind: "date",   options: { desc: "Year ↓", asc: "Year ↑" } },
  { key: "runtime", label: "Runtime",       kind: "number", options: { desc: "Runtime ↓", asc: "Runtime ↑" } },
  { key: "creator", label: "Creator",       kind: "single", options: { asc: "Creator A–Z" } },
  { key: "series", label: "Series",         kind: "single", options: { asc: "Series" } },
  { key: "type",   label: "Type",           kind: "text",   options: { asc: "Type A–Z", desc: "Type Z–A" } },
  { key: "genre",  label: "Genre",          kind: "text",   options: { asc: "Genre A–Z", desc: "Genre Z–A" } },
  { key: "status", label: "Status",         kind: "status", options: { asc: "Status ↑", desc: "Status ↓" } },
];

// What the two direction buttons say, by kind: [ascending, descending].
export const DIRECTION_LABELS = {
  text:   ["A → Z", "Z → A"],
  number: ["Low → high", "High → low"],
  date:   ["Oldest first", "Newest first"],
  status: ["Wishlist first", "Dropped first"],
};

const field = (key) => SORT_FIELDS.find((f) => f.key === key);

// The field a SORT_OPTIONS value belongs to, and which direction it is ("asc", "desc"), or null if unknown.
export function parseSort(option) {
  for (const f of SORT_FIELDS) {
    for (const [direction, value] of Object.entries(f.options)) {
      if (value === option) return { field: f.key, direction };
    }
  }
  return null;
}

// The SORT_OPTIONS value for a field and direction. A field with only one direction ignores the one asked for;
// a direction the field lacks falls back to the one it has.
export function buildSort(fieldKey, direction) {
  const f = field(fieldKey);
  if (!f) return null;
  return f.options[direction] || f.options.asc || f.options.desc;
}

// Does this field offer a choice of direction?
export const hasDirection = (fieldKey) => {
  const f = field(fieldKey);
  return !!f && !!f.options.asc && !!f.options.desc;
};

// The direction a field starts in when picked: newest / highest first for dates and numbers, A → Z for text.
export const defaultDirection = (fieldKey) => {
  const f = field(fieldKey);
  if (!f) return "asc";
  if (f.kind === "date" || f.kind === "number") return f.options.desc ? "desc" : "asc";
  return f.options.asc ? "asc" : "desc";
};
