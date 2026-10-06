// BoardGameGeek's official API needs a registered application, and its web pages sit behind Cloudflare, which
// turns away ordinary programs. So Board Game search works the way a person's browser does: a hidden browser
// window (desktop) or hidden web view (phone) visits boardgamegeek.com and reads the pages. That is
// unofficial — it could stop working without warning, and BoardGameGeek could treat it as against their terms —
// so the first Board Game search in either app asks the person to read this and agree. (An official-API
// version is on the project's to-do list.)
const BGG_WARNING = [
  "BoardGameGeek doesn't offer a simple, open way for other apps to search it. To search Board Games, this app opens a hidden browser window to boardgamegeek.com and reads its pages, the way your own browser would.",
  "That makes it unofficial: it could stop working without warning, and BoardGameGeek could treat it as against their terms. Nothing about you is sent beyond what any visit to their site sends (your IP address and the search itself).",
];
const BGG_NOTICE_KEY = "bgg_notice_accepted";

module.exports = { BGG_WARNING, BGG_NOTICE_KEY };
