import { describe, it, expect, vi, afterEach } from "vitest";
import auth from "@media-vault/core/authValidation";
import gog from "../services/gog.js";
const { isPlausibleAuthCode, isPlausibleToken, extractGogCode, cleanUsername, cleanNumericIds } = auth;

afterEach(() => vi.unstubAllGlobals());

const jsonResponse = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });
const stubFetch = (...responses) => {
  const fn = vi.fn();
  responses.forEach(r => fn.mockResolvedValueOnce(r));
  vi.stubGlobal("fetch", fn);
  return fn;
};
const TOKEN = "a".repeat(40);

describe("authValidation helpers", () => {
  it("auth codes: URL-safe strings only", () => {
    expect(isPlausibleAuthCode("0123456789abcdef0123456789abcdef")).toBe(true);
    for (const bad of ["", "short", "has space in it", "<script>alert(1)</script>", 12345678, null, {}, "a".repeat(600)]) {
      expect(isPlausibleAuthCode(bad)).toBe(false);
    }
  });

  it("tokens: one long-enough string with no whitespace or control chars", () => {
    expect(isPlausibleToken(TOKEN)).toBe(true);
    expect(isPlausibleToken("eg1~abc.def-ghi_jkl")).toBe(true);
    for (const bad of ["", "short", "has a space in it", "line\nbreak12345", 123456789, null, undefined, {}, ["x".repeat(20)]]) {
      expect(isPlausibleToken(bad)).toBe(false);
    }
  });

  it("extractGogCode pulls a valid code and ignores everything else", () => {
    expect(extractGogCode("https://embed.gog.com/on_login_success?origin=client&code=AbC123xyz789")).toBe("AbC123xyz789");
    expect(extractGogCode("https://x.gog.com/?foo=1&code=AbC123xyz789#frag")).toBe("AbC123xyz789");
    expect(extractGogCode("https://www.gog.com/")).toBeNull();
    expect(extractGogCode(null)).toBeNull();
  });

  it("extractGogCode does not throw on a malformed percent-escape", () => {
    expect(() => extractGogCode("https://x.gog.com/?code=%E0%A4%A")).not.toThrow();
    expect(extractGogCode("https://x.gog.com/?code=%E0%A4%A")).toBeNull();
  });

  it("extractGogCode rejects an implausible code", () => {
    expect(extractGogCode("https://x.gog.com/?code=abc")).toBeNull();
    expect(extractGogCode("https://x.gog.com/?code=" + encodeURIComponent("<b>evil</b>12345"))).toBeNull();
  });

  it("cleanUsername keeps strings only, trimmed and capped", () => {
    expect(cleanUsername("  Ada  ")).toBe("Ada");
    expect(cleanUsername("x".repeat(300))).toHaveLength(100);
    for (const bad of ["", "   ", 42, null, {}, ["a"]]) expect(cleanUsername(bad)).toBeNull();
  });

  it("cleanNumericIds keeps digit-only ids, so nothing path-like reaches a URL", () => {
    expect(cleanNumericIds([1207658930, "1207658931", "12/../etc", "12a", -5, 1.5, null, {}])).toEqual([1207658930, "1207658931"]);
    expect(cleanNumericIds("not an array")).toEqual([]);
    expect(cleanNumericIds(undefined)).toEqual([]);
  });
});

describe("GOG responses", () => {
  it("exchangeGogCode accepts a good response", async () => {
    stubFetch(jsonResponse({ refresh_token: TOKEN, access_token: TOKEN }));
    expect(await gog.exchangeGogCode("code12345678")).toEqual({ refreshToken: TOKEN, accessToken: TOKEN });
  });

  it("exchangeGogCode rejects a missing or malformed refresh token", async () => {
    for (const body of [{}, { refresh_token: 12345 }, { refresh_token: "has space in it" }, { refresh_token: { a: 1 } }, null]) {
      stubFetch(jsonResponse(body));
      await expect(gog.exchangeGogCode("code12345678")).rejects.toThrow(/valid token/);
    }
  });

  it("exchangeGogCode tolerates a bad access token (only used for the username)", async () => {
    stubFetch(jsonResponse({ refresh_token: TOKEN, access_token: 42 }));
    expect((await gog.exchangeGogCode("code12345678")).accessToken).toBeNull();
  });

  it("fetchGogUsername returns null without a token, and drops a non-string name", async () => {
    expect(await gog.fetchGogUsername(null)).toBeNull();
    stubFetch(jsonResponse({ username: { evil: true } }));
    expect(await gog.fetchGogUsername(TOKEN)).toBeNull();
  });

  it("fetchGogLibrary fails clearly if the refresh response has no usable access token", async () => {
    stubFetch(jsonResponse({ refresh_token: TOKEN }));
    await expect(gog.fetchGogLibrary(TOKEN)).rejects.toThrow(/unexpected response/);
  });

  it("fetchGogLibrary ignores non-array/hostile id lists instead of crashing or building odd URLs", async () => {
    const fn = stubFetch(
      jsonResponse({ access_token: TOKEN, refresh_token: 42 }),
      jsonResponse({ owned: "oops" }),
      jsonResponse({ wishlist: ["a", "b"] }),
    );
    const res = await gog.fetchGogLibrary(TOKEN);
    expect(res.owned).toEqual([]);
    expect(res.wishlist).toEqual([]);
    expect(res.newRefreshToken).toBeNull();
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
