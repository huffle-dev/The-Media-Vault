// Undo for a change to ONE item (from its profile or the edit form), the same
// ten-second Undo bar the bulk actions use. Pure — no Expo imports — so
// test/mobileItemUndo.test.js can run it.

// The values `patch` is about to overwrite, so they can be written back.
// Columns the item never had go back to null.
export function previousValues(item, patch) {
  const before = {};
  for (const key of Object.keys(patch)) {
    if (key === "updated_at") continue;
    before[key] = item[key] === undefined ? null : item[key];
  }
  return before;
}

// Words for the Undo bar: "Saved changes to Dune", "Deleted Dune".
export const savedMessage = (item) => `Saved changes to ${item.title || "item"}`;
export const deletedMessage = (item) => `Deleted ${item.title || "item"}`;
