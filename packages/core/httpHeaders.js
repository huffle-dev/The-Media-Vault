// Shared request headers used across multiple services. Split out of
// main.js as part of the code-organization plan.

// GOG, Epic's GraphQL API, and Podcast RSS feeds all sit behind bot-
// management that blocks a generic HTTP-library User-Agent outright — a
// real browser UA string is required.
const BROWSER_HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" };

module.exports = { BROWSER_HEADERS };
