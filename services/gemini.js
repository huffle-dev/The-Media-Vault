// Google Gemini (vision) integration — Import's "scan a shelf photo" feature.

const fs = require("fs");
const path = require("path");
const { generateJson, scanImageBase64 } = require("@media-vault/core/gemini");
const { sanitizeMappingInput, buildMappingPrompt, cleanMappingSuggestion } = require("@media-vault/core/csvMapping");

async function scanPhotoForItems(filePath, apiKey) {
  if (!apiKey) {
    throw new Error("No Gemini API key set — add one in Settings ⚙ to enable photo scanning.");
  }

  const ext = (path.extname(filePath).slice(1) || "jpg").toLowerCase();
  const mimeType = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" }[ext] || "image/jpeg";
  return scanImageBase64(fs.readFileSync(filePath).toString("base64"), mimeType, apiKey);
}

// Import → Map step's "Auto-map with AI". Sends only header names plus up to
// 3 sample rows (see packages/core/csvMapping.js), returns { column: field } pairs
// already filtered to real columns and allowlisted fields.
async function suggestCsvMapping({ headers, rows, fields }, apiKey) {
  if (!apiKey) {
    throw new Error("No Gemini API key set — add one in Settings ⚙ to enable AI column mapping.");
  }
  const input = sanitizeMappingInput(headers, rows, fields);
  if (input.headers.length === 0 || input.fields.length === 0) {
    throw new Error("Nothing to map.");
  }

  const raw = await generateJson(
    [{ text: buildMappingPrompt(input) }],
    apiKey,
    20000,
    {
      noContent: "Gemini returned no content — try again, or map the columns by hand.",
      unparseable: "Gemini returned unparseable output — try again, or map the columns by hand.",
    },
  );

  return cleanMappingSuggestion(raw, input.headers, input.fields.map(f => f.value));
}

module.exports = { scanPhotoForItems, suggestCsvMapping };
