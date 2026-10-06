// Pure, side-effect-free small formatting helpers. Split out from main.js so
// these have direct unit test coverage without needing Electron context.
// See test/format.test.js.

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// "1234567" -> "1.2M" — display string for subscribers, matching how budget/
// box_office already store pre-formatted text rather than a raw number.
function formatCount(raw) {
  if (raw === undefined || raw === null) return null;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

module.exports = { slugify, formatCount };
