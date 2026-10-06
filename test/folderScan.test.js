import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseFolderName } from "@media-vault/core/folderScan";
import folderScanModule from "../lib/folderScan.js";
const { scanLocalLibraryFolder } = folderScanModule;

describe("parseFolderName", () => {
  it("matches the recognised 'Title (YYYY)' shape", () => {
    expect(parseFolderName("The Matrix (1999)")).toEqual({ title: "The Matrix", year: 1999 });
  });

  it("trims trailing text before the year", () => {
    expect(parseFolderName("Inception  (2010)")).toEqual({ title: "Inception", year: 2010 });
  });

  it("returns null when there's no parenthesized year", () => {
    expect(parseFolderName("Random Folder")).toBeNull();
  });
});

describe("scanLocalLibraryFolder", () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vault-folderscan-test-"));
    fs.mkdirSync(path.join(tmpDir, "The Matrix (1999)"));
    fs.mkdirSync(path.join(tmpDir, "Unsorted Stuff"));
    fs.writeFileSync(path.join(tmpDir, "not-a-folder.txt"), "x");
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("splits subfolders into recognised and unrecognised, ignoring plain files", () => {
    const { recognised, unrecognised } = scanLocalLibraryFolder(tmpDir, "Movie");
    expect(recognised).toEqual([{
      title: "The Matrix", year: 1999, media_type: "Movie",
      folder_name: "The Matrix (1999)",
      full_path: path.join(tmpDir, "The Matrix (1999)"),
    }]);
    expect(unrecognised).toEqual(["Unsorted Stuff"]);
  });

  it("throws a clear error for a folder that can't be read", () => {
    expect(() => scanLocalLibraryFolder(path.join(tmpDir, "does-not-exist"), "Movie")).toThrow(/Cannot read folder/);
  });
});
