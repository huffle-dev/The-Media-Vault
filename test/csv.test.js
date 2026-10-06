import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { EXPORT_HEADERS, csvEscape } from "@media-vault/core/csv";
import csv from "../lib/csv.js";
const { buildExportCsv } = csv;

describe("csvEscape", () => {
  it("returns plain values unchanged", () => {
    expect(csvEscape("Plain Title")).toBe("Plain Title");
  });

  it("quotes and escapes a value containing a comma", () => {
    expect(csvEscape("Title, With Comma")).toBe('"Title, With Comma"');
  });

  it("quotes and doubles internal quotes", () => {
    expect(csvEscape('Say "hi"')).toBe('"Say ""hi"""');
  });

  it("quotes a value containing a newline", () => {
    expect(csvEscape("Line one\nLine two")).toBe('"Line one\nLine two"');
  });

  it("returns an empty string for null/undefined", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });
});

describe("buildExportCsv", () => {
  let tmpDir;
  let realArtPath;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vault-csv-test-"));
    realArtPath = path.join(tmpDir, "cover.jpg");
    fs.writeFileSync(realArtPath, "fake-jpg-bytes");
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes the header row matching EXPORT_HEADERS exactly", () => {
    const csvText = buildExportCsv([], { withArtRefs: false });
    expect(csvText).toBe(EXPORT_HEADERS.join(","));
  });

  it("writes a relative cover_art/<filename> reference when withArtRefs is true and the file exists", () => {
    const csvText = buildExportCsv([{ title: "Has Art", cover_art_path: realArtPath }], { withArtRefs: true });
    const dataRow = csvText.split("\n")[1];
    const coverArtIndex = EXPORT_HEADERS.indexOf("cover_art_path");
    expect(dataRow.split(",")[coverArtIndex]).toBe("cover_art/cover.jpg");
  });

  it("leaves cover_art_path blank when withArtRefs is false, even if a path is set", () => {
    const csvText = buildExportCsv([{ title: "Has Art", cover_art_path: realArtPath }], { withArtRefs: false });
    const dataRow = csvText.split("\n")[1];
    const coverArtIndex = EXPORT_HEADERS.indexOf("cover_art_path");
    expect(dataRow.split(",")[coverArtIndex]).toBe("");
  });

  it("leaves cover_art_path blank when the referenced file doesn't actually exist on disk", () => {
    const csvText = buildExportCsv([{ title: "Missing Art", cover_art_path: path.join(tmpDir, "does-not-exist.jpg") }], { withArtRefs: true });
    const dataRow = csvText.split("\n")[1];
    const coverArtIndex = EXPORT_HEADERS.indexOf("cover_art_path");
    expect(dataRow.split(",")[coverArtIndex]).toBe("");
  });

  it("writes list_names into the lists column", () => {
    // Asserting via .includes() rather than a naive dataRow.split(",") —
    // the value itself contains a comma and gets quoted (csvEscape's job),
    // so splitting the whole row on "," would incorrectly cut it in two.
    const csvText = buildExportCsv([{ title: "Listed", list_names: "Favourites, Watch Later" }], { withArtRefs: false });
    const dataRow = csvText.split("\n")[1];
    expect(dataRow).toContain('"Favourites, Watch Later"');
  });
});
