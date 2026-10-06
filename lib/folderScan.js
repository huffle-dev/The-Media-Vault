// Local Library folder-scan helpers. Split out of main.js as part of the
// code-organization plan — desktop-only fs/path logic with no Electron or
// DB dependency. The naming convention itself (parseFolderName) has no fs
// dependency and lives in @media-vault/core/folderScan.

const fs = require("fs");
const path = require("path");
const { parseFolderName } = require("@media-vault/core/folderScan");

// Scans one level of subfolders under folderPath, splitting them into
// recognised ("Title (YYYY)") and unrecognised (everything else, left for
// the user to handle manually).
function scanLocalLibraryFolder(folderPath, mediaType) {
  let subfolders;
  try {
    subfolders = fs.readdirSync(folderPath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch (err) {
    throw new Error(`Cannot read folder: ${err.message}`);
  }

  const recognised   = [];
  const unrecognised = [];

  for (const name of subfolders) {
    const parsed = parseFolderName(name);
    if (!parsed) {
      unrecognised.push(name);
    } else {
      recognised.push({ ...parsed, media_type: mediaType, folder_name: name, full_path: path.join(folderPath, name) });
    }
  }

  return { recognised, unrecognised };
}

module.exports = { parseFolderName, scanLocalLibraryFolder };
