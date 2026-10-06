import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import importCoverArtModule from "../lib/importCoverArt.js";
const { resolveImportCoverArt } = importCoverArtModule;

describe("resolveImportCoverArt", () => {
  let sourceDir, destDir;

  beforeAll(() => {
    sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "vault-import-src-"));
    destDir   = fs.mkdtempSync(path.join(os.tmpdir(), "vault-import-dest-"));
    fs.writeFileSync(path.join(sourceDir, "cover.jpg"), "fake-image-bytes");
  });

  afterAll(() => {
    fs.rmSync(sourceDir, { recursive: true, force: true });
    fs.rmSync(destDir, { recursive: true, force: true });
  });

  it("copies a real, in-bounds cover art file and rewrites its path", () => {
    const [resolved] = resolveImportCoverArt(
      [{ title: "Item", cover_art_path: "cover.jpg" }], sourceDir, destDir
    );
    expect(resolved.cover_art_path).toBe(path.join(destDir, "cover.jpg"));
    expect(fs.existsSync(resolved.cover_art_path)).toBe(true);
  });

  it("drops the reference when there's no cover_art_path at all", () => {
    const [resolved] = resolveImportCoverArt([{ title: "Item" }], sourceDir, destDir);
    expect(resolved.cover_art_path).toBeNull();
  });

  it("drops the reference when the source file doesn't exist", () => {
    const [resolved] = resolveImportCoverArt(
      [{ title: "Item", cover_art_path: "missing.jpg" }], sourceDir, destDir
    );
    expect(resolved.cover_art_path).toBeNull();
  });

  it("refuses a path-traversal reference outside the CSV's own folder", () => {
    const [resolved] = resolveImportCoverArt(
      [{ title: "Item", cover_art_path: "../../etc/passwd" }], sourceDir, destDir
    );
    expect(resolved.cover_art_path).toBeNull();
  });

  it("drops the reference when there's no coverArtSourceDir (no CSV path known)", () => {
    const [resolved] = resolveImportCoverArt(
      [{ title: "Item", cover_art_path: "cover.jpg" }], null, destDir
    );
    expect(resolved.cover_art_path).toBeNull();
  });
});
