import { describe, it, expect } from "vitest";
import { checkSteamId, checkSteamKey } from "../settings/steamValidation.js";

describe("checkSteamId", () => {
  it("accepts a 17-digit SteamID64, trimming whitespace", () => {
    expect(checkSteamId("  76561198012345678 ")).toEqual({ value: "76561198012345678", error: null });
  });

  it("extracts the ID from a /profiles/ URL", () => {
    expect(checkSteamId("https://steamcommunity.com/profiles/76561198012345678/")).toEqual({ value: "76561198012345678", error: null });
  });

  it("gives a specific hint for a custom /id/ URL", () => {
    expect(checkSteamId("https://steamcommunity.com/id/gaben").error).toMatch(/custom profile name/);
  });

  it("rejects wrong length, non-digits and wrong prefix", () => {
    for (const bad of ["1234", "7656119801234567", "765611980123456789", "7656119801234567a", "12345678901234567", "gaben"]) {
      expect(checkSteamId(bad).error).toMatch(/17-digit/);
    }
  });

  it("treats blank as valid (clearing the field)", () => {
    expect(checkSteamId("")).toEqual({ value: "", error: null });
    expect(checkSteamId("   ")).toEqual({ value: "", error: null });
  });
});

describe("checkSteamKey", () => {
  it("accepts 32 hex characters in either case, trimmed", () => {
    expect(checkSteamKey(" 0123456789ABCDEF0123456789abcdef ").error).toBeNull();
  });

  it("rejects wrong length or non-hex characters", () => {
    for (const bad of ["abc", "0123456789ABCDEF0123456789ABCDE", "0123456789ABCDEF0123456789ABCDEFF", "0123456789ABCDEF0123456789ABCDEG"]) {
      expect(checkSteamKey(bad).error).toMatch(/32/);
    }
  });

  it("treats blank as valid", () => {
    expect(checkSteamKey("").error).toBeNull();
  });
});
