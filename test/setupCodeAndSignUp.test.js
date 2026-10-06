import { describe, it, expect } from "vitest";
import { encodeSetupCode, decodeSetupCode, looksLikeSetupCode, PREFIX } from "@media-vault/core/setupCode";
import { validateSignUp, signUpOutcome, SIGN_UP_MESSAGES, MIN_PASSWORD } from "@media-vault/core/authForm";

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (payload) => `eyJ${b64({ alg: "HS256" }).slice(3)}.${b64(payload)}.sig_nature-1`;
const KEY = "sb_publishable_abcdefghijklmnop";
const URL_ = "https://abcdefghijkl.supabase.co";

describe("setup code", () => {
  it("round-trips the project address and publishable key", () => {
    const code = encodeSetupCode({ url: URL_, key: KEY });
    expect(code.startsWith(PREFIX)).toBe(true);
    expect(decodeSetupCode(code)).toEqual({ ok: true, url: URL_, key: KEY });
    expect(decodeSetupCode(`  ${code}\n`).ok).toBe(true); // a paste often has stray spaces
  });
  it("tidies the address (trailing slash, REST path) like the manual form does", () => {
    expect(decodeSetupCode(encodeSetupCode({ url: "abcdefghijkl.supabase.co/rest/v1", key: KEY })).url).toBe(URL_);
  });
  it("refuses to make or read a code with a secret key", () => {
    expect(() => encodeSetupCode({ url: URL_, key: ["sb", "secret", "abcdefghijklmnop"].join("_") })).toThrow(/SECRET/);
    const evil = `${PREFIX}?u=${encodeURIComponent(URL_)}&k=${encodeURIComponent(["sb", "secret", "abcdefghijklmnop"].join("_"))}`;
    expect(decodeSetupCode(evil)).toMatchObject({ ok: false });
    const service = jwt({ role: "service_role", ref: "abc" });
    expect(decodeSetupCode(`${PREFIX}?u=${encodeURIComponent(URL_)}&k=${encodeURIComponent(service)}`).ok).toBe(false);
  });
  it("says what is wrong with something that isn't a code", () => {
    expect(decodeSetupCode("https://example.com")).toEqual({ ok: false, error: "That isn't a Media Vault setup code." });
    expect(decodeSetupCode(null).ok).toBe(false);
    expect(decodeSetupCode(`${PREFIX}?u=nonsense`).ok).toBe(false);
    expect(decodeSetupCode(`${PREFIX}?u=${encodeURIComponent(URL_)}`).ok).toBe(false); // no key
  });
  it("looksLikeSetupCode is a cheap check for the paste box", () => {
    expect(looksLikeSetupCode(`  ${PREFIX}?u=1`)).toBe(true);
    expect(looksLikeSetupCode("https://abc.supabase.co")).toBe(false);
  });
});

describe("validateSignUp", () => {
  const ok = { email: "me@example.com", password: "long-enough-1", confirm: "long-enough-1" };
  it("accepts a good form", () => expect(validateSignUp(ok)).toBeNull());
  it("explains each problem", () => {
    expect(validateSignUp({ ...ok, email: "nope" })).toMatch(/valid email/);
    expect(validateSignUp({ ...ok, password: "short", confirm: "short" })).toContain(String(MIN_PASSWORD));
    expect(validateSignUp({ ...ok, confirm: "different-1" })).toMatch(/don't match/);
  });
});

describe("signUpOutcome", () => {
  it("signed in when a session comes back", () => expect(signUpOutcome({ data: { session: { access_token: "x" }, user: {} }, error: null })).toEqual({ kind: "signedIn" }));
  it("needs the email confirmed when there is a user but no session", () => {
    expect(signUpOutcome({ data: { session: null, user: { identities: [{ id: "1" }] } }, error: null })).toEqual({ kind: "confirm" });
  });
  it("spots an address that already has an account, both ways Supabase reports it", () => {
    expect(signUpOutcome({ data: { session: null, user: { identities: [] } }, error: null })).toEqual({ kind: "exists" });
    expect(signUpOutcome({ data: null, error: { message: "User already registered" } })).toEqual({ kind: "exists" });
  });
  it("words a closed server and passes other errors through", () => {
    expect(signUpOutcome({ data: null, error: { message: "Signups not allowed for this instance" } }).message).toMatch(/doesn't allow new accounts/);
    expect(signUpOutcome({ data: null, error: { message: "Password should be at least 6 characters" } })).toEqual({ kind: "error", message: "Password should be at least 6 characters" });
    expect(signUpOutcome({ data: null, error: { message: "boom" } })).toEqual({ kind: "error", message: "boom" });
  });
  it("has the messages the screens show", () => {
    expect(SIGN_UP_MESSAGES.afterSignIn).toMatch(/turn off new sign-ups/);
    expect(SIGN_UP_MESSAGES.confirm).toMatch(/confirmation link/);
  });
});
