// Google Gemini (vision): reading a photo of a shelf or collection and listing what is
// on it. The request, the prompt and the tidy-up of the answer, with no Node or Electron
// in them, so desktop (services/gemini.js) and the phone (mobile/photoScan.js) share one
// copy and test/gemini.test.js covers it. The image arrives as base64 text.
const { fetchWithTimeout } = require("./fetchWithTimeout");

const SCAN_PROMPT = `You are analyzing a photo that may show one or more physical media items — films, TV box sets, video games, board games, books, or music albums.

Identify every distinct item you can see. For each one, report:
- "title": the title as printed on the item. If unreadable, your best partial guess, or null if nothing is legible.
- "media_type": one of exactly: "Movie", "TV", "Book", "Audiobook", "Game", "Music", "Board Game".
- "confidence": "high", "medium", or "low".
- "note": optional short note (e.g. "spine partially obscured") — omit if not needed.

Respond with a JSON array only, one entry per item. If no items are visible, respond with an empty array.`;

const MODEL_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";

// One JSON-returning Gemini request. `errors` words the failures so each caller reads naturally.
async function generateJson(parts, apiKey, timeoutMs, { noContent, unparseable }, doFetch = fetchWithTimeout) {
  const res = await doFetch(
    MODEL_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: "application/json" } }),
    },
    timeoutMs,
  );
  const data = await res.json();
  if (data.error) throw new Error(`Gemini: ${data.error.message || "request failed"}`);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(noContent);
  try { return JSON.parse(text); } catch { throw new Error(unparseable); }
}

// Sends one photo and returns the raw list of items Gemini saw.
async function scanImageBase64(base64, mimeType, apiKey, doFetch) {
  if (!apiKey) throw new Error("No Gemini API key set — add one in Settings to enable photo scanning.");
  const items = await generateJson(
    [{ text: SCAN_PROMPT }, { inline_data: { mime_type: mimeType, data: base64 } }],
    apiKey,
    30000, // a vision call genuinely takes longer than a plain metadata lookup
    {
      noContent: "Gemini returned no content — the photo may have been blocked or unreadable.",
      unparseable: "Gemini returned unparseable output — try a clearer photo.",
    },
    doFetch,
  );
  if (!Array.isArray(items)) throw new Error("Unexpected response shape from Gemini.");
  return items;
}

const SCAN_TYPES = ["Movie", "TV", "Book", "Audiobook", "Game", "Music"];

// What is worth listing: only entries with a title; an unknown or unsupported type (Board
// Game has no search here) becomes Movie, like desktop; confidence defaults to medium.
function cleanScanItems(found) {
  return (Array.isArray(found) ? found : [])
    .filter((it) => it && typeof it.title === "string" && it.title.trim())
    .map((it) => ({
      title: it.title.trim(),
      media_type: SCAN_TYPES.includes(it.media_type) ? it.media_type : "Movie",
      confidence: ["high", "medium", "low"].includes(it.confidence) ? it.confidence : "medium",
      note: typeof it.note === "string" ? it.note : null,
    }));
}

module.exports = { SCAN_PROMPT, SCAN_TYPES, generateJson, scanImageBase64, cleanScanItems };
