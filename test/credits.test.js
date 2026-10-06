import { describe, it, expect } from "vitest";
import credits from "@media-vault/core/credits.js";
import licenses from "../scripts/build-licenses.js";

const { CREDITS } = credits;
const by = (name) => CREDITS.find((c) => c.name === name);

describe("credits", () => {
  it("every entry names its source, says what it is used for, and links to https", () => {
    for (const c of CREDITS) {
      expect(c.name, "name").toBeTruthy();
      expect(c.text.length, `${c.name} text`).toBeGreaterThan(20);
      expect(c.uses, `${c.name} uses`).toBeTruthy();
      expect(c.url, `${c.name} url`).toMatch(/^https:\/\//);
      for (const l of c.links || []) expect(l.url).toMatch(/^https:\/\//);
    }
  });
  it("names are unique", () => {
    expect(new Set(CREDITS.map((c) => c.name)).size).toBe(CREDITS.length);
  });
  it("keeps the statements the providers require", () => {
    expect(by("TMDB").text).toContain("not endorsed or certified by TMDB");
    expect(by("YouTube").text).toContain("YouTube API Services");
    expect(by("YouTube").links.map((l) => l.label).join()).toMatch(/Terms of Service.*Privacy Policy/);
    expect(by("IGDB").text).toContain("IGDB");
    expect(by("Steam").text).toContain("Valve Corporation");
    expect(by("Discogs").text).toContain("not affiliated with, sponsored or endorsed by Discogs");
  });
  it("credits every service the app reaches out to", () => {
    for (const name of ["TMDB", "YouTube", "IGDB", "Steam", "Discogs", "Apple", "Open Library", "Audible", "BoardGameGeek", "GOG", "Supabase"]) expect(by(name), name).toBeTruthy();
  });
});

describe("third-party licence notices", () => {
  const packages = licenses.collect();
  it("lists the packages that ship, including the bundled React", () => {
    const names = packages.map((p) => p.name);
    for (const n of ["@supabase/supabase-js", "better-sqlite3", "react", "react-dom", "archiver", "yauzl", "@tanstack/react-virtual"]) expect(names, n).toContain(n);
  });
  it("leaves out the app's own packages and the build/test tools", () => {
    const names = packages.map((p) => p.name);
    for (const n of ["@media-vault/core", "vitest", "electron-builder", "jsdom", "playwright-core", "expo", "react-native"]) expect(names, n).not.toContain(n);
  });
  it("gives every package a declared licence, and the text where one came with it", () => {
    expect(packages.filter((p) => p.license === "UNKNOWN").map((p) => p.name)).toEqual([]);
    expect(packages.filter((p) => p.text).length).toBeGreaterThan(packages.length * 0.8);
  });
  it("renders a readable notice listing each package", () => {
    const text = licenses.render(packages);
    expect(text).toContain("OPEN-SOURCE SOFTWARE NOTICES");
    expect(text).toContain(`${packages.length} packages`);
    expect(text).toContain("better-sqlite3");
  });
  it("reads the licence field in every shape package.json uses", () => {
    expect(licenses.licenceOf({ license: "MIT" })).toBe("MIT");
    expect(licenses.licenceOf({ license: { type: "ISC" } })).toBe("ISC");
    expect(licenses.licenceOf({ licenses: [{ type: "MIT" }, { type: "Apache-2.0" }] })).toBe("MIT OR Apache-2.0");
    expect(licenses.licenceOf({})).toBe("UNKNOWN");
  });
});
