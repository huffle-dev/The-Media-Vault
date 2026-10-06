import { describe, it, expect } from "vitest";
import { fieldsFor, isBoolField, keyboardFor, toInputText, parseFieldValue } from "../mobile/itemFields.js";

describe("phone item fields", () => {
  it("offers a type's fields but never cast_list", () => {
    const keys = fieldsFor("Movie").map((f) => f.key);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys).not.toContain("cast_list");
  });

  it("returns nothing for an unknown type (e.g. a removed one)", () => {
    expect(fieldsFor("MTG")).toEqual([]);
    expect(fieldsFor("Nope")).toEqual([]);
  });

  it("picks the right keyboard", () => {
    expect(keyboardFor("year")).toBe("number-pad");
    expect(keyboardFor("series_order")).toBe("decimal-pad");
    expect(keyboardFor("creator")).toBe("default");
  });

  it("shows stored values as input text", () => {
    expect(toInputText("year", null)).toBe("");
    expect(toInputText("year", undefined)).toBe("");
    expect(toInputText("year", 1999)).toBe("1999");
    expect(toInputText("abridged", 1)).toBe("1");
    expect(toInputText("abridged", 0)).toBe("0");
    expect(isBoolField("abridged")).toBe(true);
    expect(isBoolField("year")).toBe(false);
  });

  describe("parseFieldValue", () => {
    it("empty text is null; text is trimmed", () => {
      expect(parseFieldValue("creator", "   ", "Creator")).toBeNull();
      expect(parseFieldValue("creator", "  Nolan ", "Creator")).toBe("Nolan");
    });
    it("whole numbers", () => {
      expect(parseFieldValue("year", "1999", "Year")).toBe(1999);
      expect(() => parseFieldValue("year", "19.5", "Year")).toThrow("Year must be a whole number.");
      expect(() => parseFieldValue("runtime", "abc", "Runtime")).toThrow(/whole number/);
    });
    it("decimals, including zero", () => {
      expect(parseFieldValue("series_order", "2.5", "Order")).toBe(2.5);
      expect(parseFieldValue("series_order", "0", "Order")).toBe(0);
      expect(() => parseFieldValue("series_order", "x", "Order")).toThrow("Order must be a number.");
    });
    it("booleans store 0/1", () => {
      expect(parseFieldValue("abridged", "1", "Abridged")).toBe(1);
      expect(parseFieldValue("abridged", "", "Abridged")).toBe(0);
    });
  });
});
