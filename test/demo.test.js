import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { buildSampleItems, coverCredits } from "../demo/sampleData.js";
import { installDemoVault } from "../demo/vaultStub.js";
import { MEDIA_TYPES } from "../tokens.js";

const STATUSES = ["wishlist", "not-started", "in-progress", "consumed", "dropped"];

describe("demo sample library", () => {
  const items = buildSampleItems(Date.UTC(2026, 9, 5));
  it("uses only real media types and statuses, ratings in range, and unique titles", () => {
    const types = MEDIA_TYPES.map((t) => t.label);
    for (const i of items) {
      expect(STATUSES).toContain(i.status);
      if (i.rating !== null) expect(i.rating >= 1 && i.rating <= 21).toBe(true);
      expect(types).toContain(i.media_type);
    }
    expect(new Set(items.map((i) => i.title)).size).toBe(items.length);
  });
  it("gives every item a cover picture that exists, with a licence we can show it under", () => {
    for (const c of coverCredits()) {
      expect(fs.existsSync(path.join(__dirname, "..", "demo", "public", c.image))).toBe(true);
      expect(c.licence).toMatch(/^(public domain|cc0|cc by|gpl)/i);
      expect(c.source).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
      expect(c.author.length).toBeGreaterThan(0);
    }
    expect(items.every((i) => i.cover_art_path.startsWith("covers/"))).toBe(true);
  });
});

describe("demo window.vault stand-in", () => {
  const fresh = () => { const w = {}; installDemoVault(w); return w.vault; };
  it("changes stick for the page's lifetime", async () => {
    const v = fresh();
    const [first] = await v.items.getAll();
    await v.items.updateFields(first.id, { status: "dropped" });
    expect((await v.items.getAll()).find((i) => i.id === first.id).status).toBe("dropped");
  });
  it("adds, deletes and keeps lists in step", async () => {
    const v = fresh();
    const before = (await v.items.getAll()).length;
    const added = await v.items.add({ title: "New Thing", media_type: "Book" });
    expect((await v.items.getAll()).length).toBe(before + 1);
    const list = await v.lists.create("Mine");
    await v.lists.addItems(list.id, [added.id]);
    expect((await v.lists.getAll()).find((l) => l.id === list.id).item_count).toBe(1);
    await expect(v.lists.create("mine")).rejects.toThrow(/already exists/);
    await v.items.delete({ id: added.id });
    expect((await v.lists.getAll()).find((l) => l.id === list.id).item_count).toBe(0);
  });
  it("quietly does nothing for features the demo has switched off", async () => {
    const v = fresh();
    expect(await v.cloudSync.sync()).toBeNull();
    expect(typeof v.movie.onProgress(() => {})).toBe("function"); // an unsubscribe
    expect(await v.settings.get("welcomed")).toBe(true); // no welcome pop-up
  });
});

describe("demo: features that need the internet", () => {
  it("explains itself when Search Online is tried", async () => {
    const w = {}; installDemoVault(w);
    await expect(w.vault.search.query({ query: "dune", mediaType: "Movie" })).rejects.toThrow(/switched off in this demo/);
  });
});
