import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import copy from "../scripts/make-public-copy.js";

const { transformText, emptyLegacy, stripExpoAccount, findLeaks, loadPrivateLeaks, OLD_REPO, EXCLUDE } = copy;

// Fake private values: the real ones are only in the gitignored scripts/private-strings.local.json.
const EXTRA = [
  { name: "a private address", re: /fake-private-host-123/i },
  { name: "a private email", re: /someone@private\.example/i },
];
const SECRET = ["sb", "secret", "abcdefghijklmnop"].join("_");

describe("emptyLegacy", () => {
  it("empties the built-in server in both files' shape", () => {
    const desktop = 'const LEGACY = {\n  url: "https://x.supabase.co",\n  key: "sb_publishable_abc",\n};';
    expect(emptyLegacy(desktop)).toBe('const LEGACY = {\n  url: "",\n  key: "",\n};');
    expect(emptyLegacy("const LEGACY = {\n  url: \"\",\n  key: \"\",\n};")).toContain('url: ""');
  });
});

describe("transformText", () => {
  it("points the repository links at the new repository, everywhere", () => {
    const text = `see https://github.com/${OLD_REPO}/issues and ${OLD_REPO}`;
    expect(transformText("README.md", text, { repo: "me/new-repo" })).toBe("see https://github.com/me/new-repo/issues and me/new-repo");
  });
  it("empties LEGACY only in the two server files", () => {
    const t = 'const LEGACY = {\n  url: "https://a.supabase.co",\n  key: "k",\n};';
    expect(transformText("lib/supabaseConfig.js", t, { repo: "me/r" })).toContain('url: ""');
    expect(transformText("mobile/supabase.js", t, { repo: "me/r" })).toContain('key: ""');
    expect(transformText("some/other.js", t, { repo: "me/r" })).toBe(t);
  });
});

describe("what stays private", () => {
  it("leaves the backlog and its renderer out of the copy", () => {
    expect(EXCLUDE.has("BACKLOG.md")).toBe(true);
    expect(EXCLUDE.has("scripts/build-backlog-html.js")).toBe(true);
  });
  it("strips the maker's Expo account and project id from the phone app's settings", () => {
    const json = JSON.stringify({ expo: { name: "X", extra: { router: {}, eas: { projectId: "abc" } }, owner: "someone" } }, null, 2);
    const out = JSON.parse(stripExpoAccount(json));
    expect(out.expo.owner).toBeUndefined();
    expect(out.expo.extra.eas).toBeUndefined();
    expect(out.expo.extra.router).toEqual({});
    expect(out.expo.name).toBe("X");
    expect(transformText("mobile/app.json", json, { repo: "me/r" })).not.toContain("someone");
  });
  it("replaces links to the private backlog", () => {
    const t = transformText("README.md", "- **What's new:** [CHANGELOG.md](CHANGELOG.md)" + String.fromCharCode(10) + "see the project backlog", { repo: "me/r" });
    expect(t).not.toMatch(/\(BACKLOG\.md\)|\(\.\.\/BACKLOG\.md\)/);
    expect(t).toContain("CHANGELOG.md");
  });
});

describe("findLeaks", () => {
  it("catches the patterns it is given and any secret key, and passes clean files", () => {
    const files = [
      { rel: "a.js", text: 'url: "https://fake-private-host-123.supabase.co"' },
      { rel: "b.md", text: "mail me at someone@private.example" },
      { rel: "d.js", text: `key: ${SECRET}` },
      { rel: "ok.js", text: "nothing private here" },
    ];
    const found = findLeaks(files, EXTRA).map((f) => f.file);
    expect(found).toEqual(["a.js", "b.md", "d.js"]);
  });
  it("without the personal patterns it still catches a secret key", () => {
    expect(findLeaks([{ rel: "x.js", text: SECRET }]).map((f) => f.file)).toEqual(["x.js"]);
  });
});

describe("loadPrivateLeaks", () => {
  it("is null when the local file is missing, and builds case-insensitive patterns when present", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mv-priv-"));
    expect(loadPrivateLeaks(dir)).toBeNull();
    fs.writeFileSync(path.join(dir, "private-strings.local.json"), JSON.stringify([{ name: "n", pattern: "Secret-Word" }]));
    const [l] = loadPrivateLeaks(dir);
    expect(l.name).toBe("n");
    expect(l.re.test("a secret-word here")).toBe(true);
  });
});

describe("the real project passes its own check", () => {
  // Everything tracked today, run through the same transform, must come out with no leaks, including the
  // maker's real private patterns when the local file exists on this machine.
  it("has no private material once the public transform is applied", () => {
    const root = path.join(__dirname, "..");
    const files = ["lib/supabaseConfig.js", "mobile/supabase.js", "mobile/app.json", "README.md", "docs/privacy.html", "package.json", "main.js", "packages/core/links.js", "docs/cloud-sync-design.md"].map((rel) => ({
      rel, text: transformText(rel, fs.readFileSync(path.join(root, rel), "utf8"), { repo: "me/media-vault" }),
    }));
    const personal = loadPrivateLeaks(path.join(root, "scripts")) || [];
    expect(findLeaks(files, personal)).toEqual([]);
  });
});
