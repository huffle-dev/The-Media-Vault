import { describe, it, expect } from "vitest";
import deepLink from "../lib/deepLink.js";
const { parseDeepLink, SUPPORTED_DEEPLINK_TYPES } = deepLink;

describe("parseDeepLink", () => {
  it("parses a valid search link", () => {
    expect(parseDeepLink("vault://search?type=Game&q=Halo")).toEqual({
      action: "search", mediaType: "Game", query: "Halo",
    });
  });

  it("decodes a URL-encoded query with spaces/special characters", () => {
    expect(parseDeepLink("vault://search?type=Game&q=The%20Witcher%203")).toEqual({
      action: "search", mediaType: "Game", query: "The Witcher 3",
    });
  });

  it("accepts every type in SUPPORTED_DEEPLINK_TYPES", () => {
    for (const mediaType of SUPPORTED_DEEPLINK_TYPES) {
      const result = parseDeepLink(`vault://search?type=${encodeURIComponent(mediaType)}&q=x`);
      expect(result?.mediaType).toBe(mediaType);
    }
  });

  it("includes a valid 4-digit year", () => {
    expect(parseDeepLink("vault://search?type=Movie&q=Dune&year=2021")).toEqual({
      action: "search", mediaType: "Movie", query: "Dune", year: "2021",
    });
  });

  it("drops a malformed or out-of-range year without rejecting the link", () => {
    for (const bad of ["21", "abcd", "1500", "99999", ""]) {
      expect(parseDeepLink(`vault://search?type=Movie&q=Dune&year=${bad}`)).toEqual({
        action: "search", mediaType: "Movie", query: "Dune",
      });
    }
  });

  it("rejects a non-vault protocol", () => {
    expect(parseDeepLink("http://search?type=Game&q=Halo")).toBeNull();
  });

  it("rejects an unknown action", () => {
    expect(parseDeepLink("vault://open?type=Game&q=Halo")).toBeNull();
  });

  it("rejects a missing type", () => {
    expect(parseDeepLink("vault://search?q=Halo")).toBeNull();
  });

  it("rejects a type outside the allowlist", () => {
    expect(parseDeepLink("vault://search?type=Malware&q=Halo")).toBeNull();
  });

  it("rejects a missing query", () => {
    expect(parseDeepLink("vault://search?type=Game")).toBeNull();
  });

  it("rejects a blank (whitespace-only) query", () => {
    expect(parseDeepLink("vault://search?type=Game&q=%20%20")).toBeNull();
  });

  it("does not throw on a malformed URL string, returns null", () => {
    expect(() => parseDeepLink("not a url")).not.toThrow();
    expect(parseDeepLink("not a url")).toBeNull();
  });

  it("truncates an overlong query to 500 characters", () => {
    const longQuery = "a".repeat(600);
    const result = parseDeepLink(`vault://search?type=Game&q=${longQuery}`);
    expect(result.query).toHaveLength(500);
  });
});
