// Shared file-download helper, used by nearly every external-API service
// for saving cover art. Split out of main.js as part of the code-
// organization plan — it's genuinely generic, not specific to any one
// service or even to images as such.
//
// Deliberately NOT in @media-vault/core (shared-core extraction, V3 plan):
// this is real fs/http plumbing, not logic — Expo's own FileSystem.
// downloadAsync already does the equivalent job (including redirects) on
// the mobile side, so there is nothing here to actually share, only a
// contract to agree on (url, dest) => Promise<dest>. Designing that
// contract now, with no second implementation to design it against, risks
// guessing wrong; revisit once mobile actually caches its own cover art.

const fs = require("fs");

// redirectCount is internal (recursive follow-the-Location calls only) —
// real callers pass just (url, dest, headers). Bounded at 5 hops against
// redirect loops; a 15s timeout covers a connection that never responds
// (Node's http/https don't do this on their own). Every failure path cleans
// up the partial file via one shared cleanup().
//
// Two invariants, both from a real bug where a cover downloaded fine then
// vanished seconds later:
//   1. Settle exactly once (fail()/succeed() no-op after the first) — else a
//      late event on a finished request could delete a different, good file
//      a later fallback already wrote to the same `dest`.
//   2. Drain a non-2xx response immediately — an unconsumed body keeps the
//      request alive, so its 15s timeout can fire long after this promise
//      rejected and delete whatever now sits at `dest`.
// Optional hook fired after every successful download with the ORIGINAL
// requested URL (not a redirect target) and the file it was saved to —
// main.js uses it to record each cover art file's source URL centrally.
let onDownloaded = null;
const setDownloadListener = (fn) => { onDownloaded = fn; };

const downloadImage = (url, dest, headers = {}, redirectCount = 0, originalUrl = url) => new Promise((resolve, reject) => {
  if (redirectCount > 5) return reject(new Error("Too many redirects"));

  const proto = url.startsWith("https") ? require("https") : require("http");
  const file  = fs.createWriteStream(dest);
  const cleanup = () => { try { fs.unlinkSync(dest); } catch {} };

  let settled = false;
  const fail = (err) => {
    if (settled) return;
    settled = true;
    // Delete the partial file only AFTER the stream has fully closed. A write
    // stream opens its file asynchronously, so unlinking right away could run
    // before the open finished — leaving a zero-byte file behind that later
    // looks like a cached cover (found as a flaky test under load).
    file.once("close", () => { cleanup(); reject(err); });
    file.destroy();
  };
  const succeed = (value) => {
    if (settled) return;
    settled = true;
    resolve(value);
  };

  file.on("error", fail);

  const req = proto.get(url, { headers, timeout: 15000 }, response => {
    if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
      response.resume();
      if (!response.headers.location) return fail(new Error(`Redirect with no Location header (HTTP ${response.statusCode})`));
      // A relative Location is legal per the HTTP spec — resolved against
      // the URL just requested, same as a browser or fetch() would.
      const nextUrl = new URL(response.headers.location, url).href;
      if (settled) return;
      // Hand outcome to the recursive call; stop our own handlers from
      // touching `dest` — the next hop owns it now.
      settled = true;
      file.close();
      cleanup();
      req.destroy();
      return downloadImage(nextUrl, dest, headers, redirectCount + 1, originalUrl).then(resolve, reject);
    }
    if (response.statusCode !== 200) {
      response.resume();
      req.destroy();
      return fail(new Error(`HTTP ${response.statusCode}`));
    }
    response.pipe(file);
    file.on("finish", () => {
      file.close();
      if (onDownloaded) { try { onDownloaded(originalUrl, dest); } catch { /* never fail a good download over bookkeeping */ } }
      succeed(dest);
    });
  });
  req.on("timeout", () => req.destroy(new Error("Request timed out")));
  req.on("error", fail);
});

module.exports = { downloadImage, setDownloadListener };
