import { describe, it, expect } from "vitest";
import { issueUrl, REPO_ISSUES_URL } from "@media-vault/core/links.js";
import { PRIVACY_SECTIONS, PRIVACY_UPDATED } from "@media-vault/core/privacyText.js";
import licences from "../mobile/licenses.json";

describe("issueUrl (error report / feature request)", () => {
  it("builds a pre-filled GitHub new-issue link with the label, version and device", () => {
    const url = new URL(issueUrl("bug", { version: "1.2.3", platform: "android 14" }));
    expect(url.origin + url.pathname).toBe(REPO_ISSUES_URL);
    expect(url.searchParams.get("labels")).toBe("bug");
    const body = url.searchParams.get("body");
    expect(body).toContain("What happened?");
    expect(body).toContain("**App version:** 1.2.3");
    expect(body).toContain("**Device:** android 14");
  });
  it("asks different questions for a feature request", () => {
    const body = new URL(issueUrl("enhancement", { version: "1", platform: "x" })).searchParams.get("body");
    expect(body).toContain("What would you like to see?");
    expect(body).not.toContain("What happened?");
  });
});

describe("privacy text", () => {
  it("has a date and every section filled in", () => {
    expect(PRIVACY_UPDATED).toMatch(/\d{4}/);
    for (const s of PRIVACY_SECTIONS) { expect(s.title).toBeTruthy(); expect(s.paragraphs.length).toBeGreaterThan(0); }
  });
  it("says what the phone really does: camera, no analytics, own server", () => {
    const all = PRIVACY_SECTIONS.flatMap((s) => s.paragraphs).join(" ");
    expect(all).toMatch(/camera/i);
    expect(all).toMatch(/no analytics/i);
    expect(all).toMatch(/Supabase project that you own/);
  });
});

describe("mobile/licenses.json (regenerate with scripts/build-mobile-licenses.js)", () => {
  it("lists the shipped packages, each with a licence and text that exists", () => {
    expect(licences.packages.length).toBeGreaterThan(100);
    for (const p of licences.packages) {
      expect(p.license, p.name).toBeTruthy();
      if (p.text != null) expect(licences.texts[p.text], p.name).toBeTruthy();
    }
  });
  it("includes the packages the phone is built on", () => {
    const names = new Set(licences.packages.map((p) => p.name));
    for (const n of ["react-native", "expo", "expo-router", "@supabase/supabase-js"]) expect(names.has(n), n).toBe(true);
  });
});
