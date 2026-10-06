// Shared app-data directory helper — resolves under userData, creating it
// if missing. Split out of main.js as part of the code-organization plan.
//
// Deliberately NOT in @media-vault/core (shared-core extraction, V3 plan):
// app.getPath("userData") has no equivalent until a real mobile file-cache
// consumer exists (Expo's FileSystem.documentDirectory, presumably) — the
// right injectable interface here should be designed against that consumer's
// actual needs, not guessed at with none. Revisit alongside downloadImage.js
// when mobile starts caching its own cover art.

const path = require("path");
const fs = require("fs");
const { app } = require("electron");

function ensureDir(name) {
  const dir = path.join(app.getPath("userData"), name);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const coverArtDir = () => ensureDir("cover_art");

module.exports = { coverArtDir };
