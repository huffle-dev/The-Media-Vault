import { describe, it, expect } from "vitest";
import format from "@media-vault/core/format";
const { slugify, formatCount } = format;

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("collapses runs of non-alphanumeric characters into one hyphen", () => {
    expect(slugify("A --- B   C!!!D")).toBe("a-b-c-d");
  });

  it("strips leading/trailing hyphens", () => {
    expect(slugify("!!!Wrapped!!!")).toBe("wrapped");
  });
});

describe("formatCount", () => {
  it("formats millions with one decimal, dropping a trailing .0", () => {
    expect(formatCount(2500000)).toBe("2.5M");
    expect(formatCount(3000000)).toBe("3M");
  });

  it("formats thousands with one decimal, dropping a trailing .0", () => {
    expect(formatCount(1500)).toBe("1.5K");
    expect(formatCount(2000)).toBe("2K");
  });

  it("returns small numbers as a plain string", () => {
    expect(formatCount(999)).toBe("999");
    expect(formatCount(0)).toBe("0");
  });

  it("returns null for null, undefined, or non-numeric input", () => {
    expect(formatCount(null)).toBeNull();
    expect(formatCount(undefined)).toBeNull();
    expect(formatCount("not a number")).toBeNull();
  });
});
