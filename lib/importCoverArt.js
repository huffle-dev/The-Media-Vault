// CSV import's cover-art resolution — copies each row's referenced image
// (relative to the CSV's own folder, the shape a Vault export's zip
// extracts to) into the app's own cover_art folder, dropping the reference
// for anything unsafe or missing. Split out of main.js as part of the
// code-organization plan — pure fs/path logic with no DB dependency.
// isPathContained itself has no fs dependency and lives in
// @media-vault/core/pathSafety, shared with lib/safeZip.js's own
// traversal guard — this used to hand-duplicate that exact check.

const fs = require("fs");
const path = require("path");
const { isPathContained } = require("@media-vault/core/pathSafety");

// Resolves and copies in every item's cover_art_path ahead of the actual
// db.importItems() call. Each item's cover_art_path is checked against
// coverArtSourceDir (not just "does this path resolve somewhere real") so a
// CSV crafted with a `../../` reference can't be used to read an arbitrary
// file off the importing machine — a real path-traversal guard, not just a
// convenience check.
function resolveImportCoverArt(items, coverArtSourceDir, destDir) {
  return items.map(item => {
    if (!coverArtSourceDir || !item.cover_art_path) {
      return { ...item, cover_art_path: null };
    }
    const sourcePath = path.join(coverArtSourceDir, item.cover_art_path);
    if (!isPathContained(sourcePath, coverArtSourceDir)) {
      return { ...item, cover_art_path: null };
    }
    if (!fs.existsSync(sourcePath)) {
      return { ...item, cover_art_path: null };
    }
    const destPath = path.join(destDir, path.basename(sourcePath));
    try {
      fs.copyFileSync(sourcePath, destPath);
      return { ...item, cover_art_path: destPath };
    } catch {
      return { ...item, cover_art_path: null };
    }
  });
}

module.exports = { resolveImportCoverArt };
