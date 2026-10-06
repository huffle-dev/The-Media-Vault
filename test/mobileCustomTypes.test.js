import { describe, it, expect } from "vitest";
import { fetchCustomTypes, withCustomTypeId, parseCustomFields, customValueText, customInputText, parseCustomInput, buildCustomFieldsJson } from "../mobile/customTypes.js";
import { effectiveType, getEffectiveTypeConfig, withCustomTypeTabs } from "../packages/core/tokens/mediaTypes.js";

const client = (types, fields, typeErr = null) => ({
  from: (name) => name === "custom_types"
    ? { select: () => ({ is: () => ({ order: async () => ({ data: types, error: typeErr }) }) }) }
    : { select: () => ({ is: () => ({ order: async () => ({ data: fields, error: null }) }) }) },
});

describe("fetchCustomTypes", () => {
  it("attaches each type's fields in order, using the sync id as the id", async () => {
    const out = await fetchCustomTypes(client(
      [{ sync_id: "t1", label: "Vinyl", icon: "💿", color: "#ff0000" }, { sync_id: "t2", label: "Wine", icon: "🍷", color: "#800000" }],
      [{ sync_id: "f1", custom_type_sync_id: "t1", key: "pressing", label: "Pressing", field_type: "text", sort_order: 0 },
       { sync_id: "f2", custom_type_sync_id: "t1", key: "owned", label: "Owned", field_type: "checkbox", sort_order: 1 },
       { sync_id: "f3", custom_type_sync_id: "t1", key: "weird", label: "Weird", field_type: "hologram", sort_order: 2 }],
    ));
    expect(out[0]).toMatchObject({ id: "t1", label: "Vinyl" });
    expect(out[0].fields.map((f) => [f.key, f.field_type])).toEqual([["pressing", "text"], ["owned", "checkbox"], ["weird", "text"]]);
    expect(out[1].fields).toEqual([]);
  });
  it("throws when the server refuses, so the caller can keep what it had", async () => {
    await expect(fetchCustomTypes(client(null, [], new Error("nope")))).rejects.toThrow("nope");
  });
});

describe("working with desktop's shared type helpers", () => {
  it("gives a custom item its own tab key, icon and colour", () => {
    const types = [{ id: "t1", sync_id: "t1", label: "Vinyl", icon: "💿", color: "#ff0000", fields: [] }];
    const item = withCustomTypeId({ sync_id: "i1", media_type: "Custom", custom_type_sync_id: "t1" });
    expect(effectiveType(item)).toBe("custom:t1");
    expect(getEffectiveTypeConfig(item, types)).toMatchObject({ label: "Vinyl", icon: "💿", color: "#ff0000" });
    expect(withCustomTypeTabs(types).at(-1)).toMatchObject({ label: "Vinyl", includes: ["custom:t1"], isCustom: true });
  });
  it("leaves ordinary items alone (same object back)", () => {
    const item = { sync_id: "i2", media_type: "Book" };
    expect(withCustomTypeId(item)).toBe(item);
  });
});

describe("custom field values", () => {
  const f = (field_type, label = "X") => ({ key: "k", label, field_type });
  it("reads a damaged or missing value as no fields", () => {
    expect(parseCustomFields(null)).toEqual({});
    expect(parseCustomFields("{broken")).toEqual({});
    expect(parseCustomFields("[1,2]")).toEqual({});
    expect(parseCustomFields('{"a":1}')).toEqual({ a: 1 });
  });
  it("shows checkboxes as Yes/No and blanks as empty", () => {
    expect(customValueText(f("checkbox"), 1)).toBe("Yes");
    expect(customValueText(f("checkbox"), false)).toBe("No");
    expect(customValueText(f("text"), "")).toBe("");
    expect(customValueText(f("number"), 4)).toBe("4");
    expect(customInputText(f("checkbox"), true)).toBe("1");
  });
  it("turns input text back into values, with readable errors", () => {
    expect(parseCustomInput(f("number"), " 12.5 ")).toBe(12.5);
    expect(() => parseCustomInput(f("number", "Year"), "abc")).toThrow("Year must be a number.");
    expect(parseCustomInput(f("date"), "2026-10-05")).toBe("2026-10-05");
    expect(() => parseCustomInput(f("date", "Bought"), "5 Oct")).toThrow(/Bought must be a date/);
    expect(() => parseCustomInput(f("url", "Link"), "example.com")).toThrow(/Link must start with http/);
    expect(parseCustomInput(f("text"), "  ")).toBeNull();
    expect(parseCustomInput(f("checkbox"), "1")).toBe(true);
  });
  it("saves changes over the existing values and keeps ones it doesn't know", () => {
    const fields = [{ key: "pressing", label: "Pressing", field_type: "text" }, { key: "owned", label: "Owned", field_type: "checkbox" }];
    const json = buildCustomFieldsJson('{"pressing":"180g","extra":"keep"}', fields, { pressing: "Original", owned: "1" });
    expect(JSON.parse(json)).toEqual({ pressing: "Original", extra: "keep", owned: true });
    expect(buildCustomFieldsJson('{"pressing":"180g"}', fields, { pressing: "", owned: "0" })).toBeNull();
  });
});
