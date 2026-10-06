import { describe, it, expect } from "vitest";
import { slugify, uniqueKey } from "@media-vault/core/customTypeKeys.js";
import { emptyForm, formFromType, newField, validateTypeForm, saveCustomType, deleteCustomType } from "../mobile/customTypeEdit.js";

describe("field keys", () => {
  it("makes a tidy key from a label, unique within the type", () => {
    expect(slugify("Vinyl color!")).toBe("vinyl_color");
    expect(slugify("  ")).toBe("field");
    expect(uniqueKey("Notes", ["notes", "notes_2"])).toBe("notes_3");
    expect(newField(["field"]).key).toBe("field_2");
  });
});

describe("validateTypeForm", () => {
  const ok = { ...emptyForm(), label: "Vinyl", fields: [{ key: "k", label: "Pressing", field_type: "text" }] };
  it("accepts a complete form", () => expect(validateTypeForm(ok, ["Wine"])).toBeNull());
  it("explains what is missing", () => {
    expect(validateTypeForm({ ...ok, label: " " })).toMatch(/name/);
    expect(validateTypeForm({ ...ok, label: "wine" }, ["Wine"])).toMatch(/already have/);
    expect(validateTypeForm({ ...ok, icon: "" })).toMatch(/icon/);
    expect(validateTypeForm({ ...ok, color: "red" })).toMatch(/colour/);
    expect(validateTypeForm({ ...ok, fields: [{ key: "k", label: "", field_type: "text" }] })).toMatch(/Every field/);
    expect(validateTypeForm({ ...ok, fields: [{ key: "k", label: "X", field_type: "hologram" }] })).toMatch(/unknown kind/);
  });
});

function fake(error = {}) {
  const log = [];
  const client = {
    log,
    from: (table) => ({
      upsert: async (rows, opts) => { log.push(["upsert", table, rows, opts]); return { error: error[table] || null }; },
      update: (patch) => ({ eq: async (col, id) => { log.push(["update", table, patch, col, id]); return { error: error[table] || null }; } }),
    }),
  };
  return client;
}
let n = 0;
const makeId = () => `id-${++n}`;

describe("saveCustomType", () => {
  it("creates a type and numbers its fields in order", async () => {
    n = 0;
    const c = fake();
    const form = { ...emptyForm(), label: " Vinyl ", fields: [{ sync_id: null, key: "pressing", label: "Pressing", field_type: "text" }, { sync_id: null, key: "owned", label: "Owned", field_type: "checkbox" }] };
    const id = await saveCustomType(c, { userId: "u1", form, existing: null, makeId });
    expect(id).toBe("id-1");
    expect(c.log[0][2]).toMatchObject({ sync_id: "id-1", user_id: "u1", label: "Vinyl", deleted_at: null });
    expect(c.log[1][2].map((r) => [r.key, r.sort_order, r.custom_type_sync_id, r.deleted_at])).toEqual([["pressing", 0, "id-1", null], ["owned", 1, "id-1", null]]);
  });
  it("on an edit keeps existing fields' ids and keys, and marks removed ones deleted", async () => {
    const existing = { sync_id: "t1", fields: [{ sync_id: "f1", key: "a", label: "A", field_type: "text" }, { sync_id: "f2", key: "b", label: "B", field_type: "number" }] };
    const c = fake();
    await saveCustomType(c, { userId: "u1", form: { sync_id: "t1", label: "T", icon: "💿", color: "#d4a017", fields: [{ sync_id: "f2", key: "b", label: "B renamed", field_type: "number" }] }, existing, makeId });
    const rows = c.log[1][2];
    expect(rows.find((r) => r.sync_id === "f2")).toMatchObject({ key: "b", label: "B renamed", sort_order: 0, deleted_at: null });
    expect(rows.find((r) => r.sync_id === "f1").deleted_at).toBeTruthy();
  });
  it("throws the server's message and stops", async () => {
    const c = fake({ custom_types: { message: "denied" } });
    await expect(saveCustomType(c, { userId: "u", form: { ...emptyForm(), label: "X" }, existing: null, makeId })).rejects.toThrow("denied");
    expect(c.log).toHaveLength(1);
  });
});

describe("deleteCustomType", () => {
  const type = { sync_id: "t1", fields: [{ sync_id: "f1" }] };
  it("refuses while items still use it", async () => {
    await expect(deleteCustomType(fake(), type, 3)).rejects.toThrow(/3 items still use this type/);
    await expect(deleteCustomType(fake(), type, 1)).rejects.toThrow(/1 item still use this type — delete or re-type it/);
  });
  it("marks the type and its fields deleted", async () => {
    const c = fake();
    await deleteCustomType(c, type, 0);
    expect(c.log.map((l) => [l[1], l[2].deleted_at ? "deleted" : "?"])).toEqual([["custom_types", "deleted"], ["custom_type_fields", "deleted"]]);
  });
});

describe("formFromType", () => {
  it("copies a type so edits don't touch the original", () => {
    const t = { sync_id: "t", label: "L", icon: "i", color: "#000000", fields: [{ sync_id: "f", key: "k", label: "K", field_type: "text" }] };
    const f = formFromType(t);
    f.fields[0].label = "changed";
    expect(t.fields[0].label).toBe("K");
  });
});
