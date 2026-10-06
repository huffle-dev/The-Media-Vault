// CSV export helpers. Split out from main.js so this has direct unit test
// coverage without needing Electron context. See test/csv.test.js.
// EXPORT_HEADERS/csvEscape have no fs dependency and live in
// @media-vault/core/csv; buildExportCsv below checks cover art files on
// disk, a genuinely desktop-only concern, so it stays here.

const fs = require("fs");
const path = require("path");
const { EXPORT_HEADERS, csvEscape } = require("@media-vault/core/csv");

// Shared by both export handlers. cover_art_path only gets a real value when
// withArtRefs is true (the zip variant, which actually bundles the images at
// that relative path) — for the CSV-only variant there's nothing on disk for
// it to point to, so it's left blank rather than referencing a cover_art/
// folder that won't exist alongside the file.
function buildExportCsv(items, { withArtRefs }) {
  const rows = items.map(item => {
    const hasArt = withArtRefs && item.cover_art_path && fs.existsSync(item.cover_art_path);
    const relCoverArt = hasArt ? `cover_art/${path.basename(item.cover_art_path)}` : "";
    return EXPORT_HEADERS.map(h => {
      if (h === "cover_art_path") return csvEscape(relCoverArt);
      if (h === "lists") return csvEscape(item.list_names || "");
      return csvEscape(item[h]);
    }).join(",");
  });
  return [EXPORT_HEADERS.join(","), ...rows].join("\n");
}

module.exports = { EXPORT_HEADERS, csvEscape, buildExportCsv };
