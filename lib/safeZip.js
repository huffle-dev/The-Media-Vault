// Safe zip extraction. Split out from main.js so the path/symlink validation
// — the actual security-relevant logic — has direct unit test coverage
// without needing Electron context or a real zip file. See test/safeZip.test.js.
// isPathContained itself has no fs/zip dependency and lives in
// @media-vault/core/pathSafety, shared with lib/importCoverArt.js's own
// traversal guard.

const fs = require("fs");
const path = require("path");
const yauzl = require("yauzl");
const { isPathContained } = require("@media-vault/core/pathSafety");

// A legitimate Vault backup (produced by this app's own archiver-based
// backup:create) never contains a symlink — the only reason one would be
// present is a maliciously crafted zip. Checked via the Unix file-mode bits
// yauzl exposes on each entry, regardless of the platform actually doing
// the extracting.
function isSymlinkEntry(entry) {
  const unixMode = entry.externalFileAttributes >>> 16;
  return (unixMode & 0xA000) === 0xA000;
}

// Extracts via yauzl directly rather than the more convenient extract-zip
// package — extract-zip carries an unpatched (CVSS 8.1) symlink-path-
// traversal vulnerability; isPathContained and isSymlinkEntry above close
// that exact vulnerability class by hand.
function safeExtractZip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);
      zipfile.on("error", reject);
      zipfile.readEntry();
      zipfile.on("entry", (entry) => {
        const destPath = path.join(destDir, entry.fileName);
        if (!isPathContained(destPath, destDir)) {
          zipfile.close();
          return reject(new Error("Backup file contains an unsafe path and can't be restored."));
        }
        if (isSymlinkEntry(entry)) {
          zipfile.close();
          return reject(new Error("Backup file contains unexpected symlinked content and can't be restored."));
        }
        if (/[/\\]$/.test(entry.fileName)) {
          fs.mkdirSync(destPath, { recursive: true });
          zipfile.readEntry();
          return;
        }
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        zipfile.openReadStream(entry, (err, readStream) => {
          if (err) return reject(err);
          const writeStream = fs.createWriteStream(destPath);
          readStream.pipe(writeStream);
          writeStream.on("finish", () => zipfile.readEntry());
          writeStream.on("error", reject);
        });
      });
      zipfile.on("end", () => resolve());
    });
  });
}

module.exports = { safeExtractZip, isPathContained, isSymlinkEntry };
