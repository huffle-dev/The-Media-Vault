// Pure, side-effect-free HTML/entity text cleanup. Split out from main.js so
// this has direct unit test coverage without needing Electron context.
// See test/htmlText.test.js.

// &apos; is the named-entity form RSS/XML feeds commonly use, distinct from
// the numeric &#39;/&#039; form.
//
// Decoding &amp; first and separately from the rest would over-decode a
// double-encoded entity: "&amp;lt;" (meant to literally display "&lt;")
// would decode to "&lt;" after the &amp; pass, then get wrongly decoded
// again into "<" by the &lt; pass that follows. Matching all entities in a
// single regex pass avoids re-scanning text any earlier replace already
// produced, so a double-encoded entity decodes exactly once.
const ENTITY_MAP = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
function decodeHtmlEntities(str) {
  return str.replace(/&amp;|&lt;|&gt;|&quot;|&#0?39;|&apos;/g, (m) => (m === "&apos;" || /^&#0?39;$/.test(m) ? "'" : ENTITY_MAP[m]));
}

// GOG's product description fields (description.lead/description.full)
// contain real markup (<b>, <br>, etc.) — used by resolveSearchDetails'
// GOG branch to get a plain-text notes field.
function stripHtml(str) {
  return decodeHtmlEntities(str.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")).replace(/\s+/g, " ").trim();
}

module.exports = { decodeHtmlEntities, stripHtml };
