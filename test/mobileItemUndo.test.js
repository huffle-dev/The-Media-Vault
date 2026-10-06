import { describe, it, expect } from "vitest";
import { previousValues, savedMessage, deletedMessage } from "../mobile/itemUndo.js";

describe("single-item undo", () => {
  it("remembers only the columns being changed, and null for ones the item never had", () => {
    const item = { sync_id: "a", title: "Dune", status: "Backlog", rating: null, personal_notes: "good" };
    const patch = { status: "Completed", rating: 7, date_consumed: "2026-10-05", personal_notes: "great", updated_at: "x" };
    expect(previousValues(item, patch)).toEqual({ status: "Backlog", rating: null, date_consumed: null, personal_notes: "good" });
  });
  it("keeps falsy-but-real values (0, empty string) instead of nulling them", () => {
    expect(previousValues({ is_hidden: 0, notes: "" }, { is_hidden: 1, notes: "x" })).toEqual({ is_hidden: 0, notes: "" });
  });
  it("words the bar by title", () => {
    expect(savedMessage({ title: "Dune" })).toBe("Saved changes to Dune");
    expect(deletedMessage({})).toBe("Deleted item");
  });
});
