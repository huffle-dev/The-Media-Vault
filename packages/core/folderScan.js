// "Title (YYYY)" — the one folder-naming convention the Local Library
// folder scanner recognizes. Pure string matching, no filesystem access —
// split out from lib/folderScan.js (which does the actual fs.readdirSync
// scan, a desktop-only feature) so this convention is available to any
// future platform-agnostic use without pulling in fs.
function parseFolderName(name) {
  const match = name.match(/^(.+?)\s*\((\d{4})\)/);
  if (!match) return null;
  return { title: match[1].trim(), year: parseInt(match[2], 10) };
}

module.exports = { parseFolderName };
