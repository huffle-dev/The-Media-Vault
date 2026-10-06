import { describe, it, expect } from "vitest";
import path from "path";
import { isPathContained } from "@media-vault/core/pathSafety";
import safeZip from "../lib/safeZip.js";
const { isSymlinkEntry } = safeZip;

// Built with path.join rather than hardcoded forward slashes, since
// isPathContained compares against path.sep — a literal "/"-separated
// string is wrong on Windows, where path.sep is "\".
const destDir = path.join("vault", "cover_art");

describe("isPathContained", () => {
  it("accepts a path that resolves inside destDir", () => {
    expect(isPathContained(path.join(destDir, "foo.jpg"), destDir)).toBe(true);
  });

  it("accepts destDir itself", () => {
    expect(isPathContained(destDir, destDir)).toBe(true);
  });

  it("rejects a zip-slip path that escapes destDir via ..", () => {
    // path.join would already have resolved this before calling
    // isPathContained — simulating the resolved result here, which is the
    // actual input the real call site passes.
    expect(isPathContained(path.join("vault", "elsewhere", "secret"), destDir)).toBe(false);
  });

  it("rejects a sibling directory that merely shares a prefix", () => {
    // "vault/cover_art_evil" starts with the string "vault/cover_art" but is
    // NOT inside it — the +path.sep check in the real implementation exists
    // exactly to catch this case.
    expect(isPathContained(path.join("vault", "cover_art_evil", "file"), destDir)).toBe(false);
  });
});

describe("isSymlinkEntry", () => {
  it("detects a symlink via its Unix mode bits", () => {
    // 0xA1FF << 16 is a real symlink mode (0120777) as yauzl exposes it
    const entry = { externalFileAttributes: (0xA1FF << 16) >>> 0 };
    expect(isSymlinkEntry(entry)).toBe(true);
  });

  it("does not flag a regular file", () => {
    // 0x81A4 << 16 is a real regular-file mode (0100644)
    const entry = { externalFileAttributes: (0x81A4 << 16) >>> 0 };
    expect(isSymlinkEntry(entry)).toBe(false);
  });

  it("does not flag a directory", () => {
    // 0x41ED << 16 is a real directory mode (0040755)
    const entry = { externalFileAttributes: (0x41ED << 16) >>> 0 };
    expect(isSymlinkEntry(entry)).toBe(false);
  });
});
