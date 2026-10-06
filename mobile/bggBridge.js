// BoardGameGeek only answers a real browser: its pages sit behind Cloudflare, which turns
// away a plain request. So the phone keeps ONE hidden web view that has loaded
// boardgamegeek.com (and so holds Cloudflare's cookie) and asks it to make each request —
// the same trick desktop plays with a hidden window. This file is the request/answer
// bookkeeping, with no React Native in it, so test/mobileBggBridge.test.js can run it; the
// web view itself is BggHost.js.

// The script the hidden page runs for one request. It answers with a message carrying the
// same id, so concurrent requests don't get mixed up.
export function buildRequestScript(id, url, kind) {
  const read = kind === "json" ? "r.json()" : "r.text()";
  return `(async () => {
  try {
    const r = await fetch(${JSON.stringify(url)});
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const body = await ${read};
    window.ReactNativeWebView.postMessage(JSON.stringify({ id: ${Number(id)}, ok: true, body }));
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ id: ${Number(id)}, ok: false, error: String((e && e.message) || e) }));
  }
})(); true;`;
}

// The page's answer, or null if the message isn't one of ours.
export function parseBridgeMessage(data) {
  try {
    const m = JSON.parse(data);
    return m && typeof m.id === "number" && typeof m.ok === "boolean" ? m : null;
  } catch {
    return null;
  }
}

// Requests in flight, by id. `send(script)` runs a script in the hidden page.
export function createBridge({ send, timeoutMs = 20000, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let next = 1;
  const pending = new Map();
  return {
    request(url, kind) {
      const id = next++;
      return new Promise((resolve, reject) => {
        const timer = setTimer(() => { pending.delete(id); reject(new Error("BoardGameGeek took too long to answer. Try again in a moment.")); }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        send(buildRequestScript(id, url, kind));
      });
    },
    receive(data) {
      const m = parseBridgeMessage(data);
      const entry = m && pending.get(m.id);
      if (!entry) return;
      pending.delete(m.id);
      clearTimer(entry.timer);
      if (m.ok) entry.resolve(m.body); else entry.reject(new Error(m.error));
    },
    // Fails everything still waiting (the page was reloaded or went away).
    failAll(message) {
      for (const [id, entry] of pending) { clearTimer(entry.timer); entry.reject(new Error(message)); pending.delete(id); }
    },
    get size() { return pending.size; },
  };
}

// The host (BggHost) registers how to reach the page; the rest of the app just calls bggFetch.
let handler = null;
export const setBggHandler = (fn) => { handler = fn; };
export function bggFetch(url, kind) {
  if (!handler) return Promise.reject(new Error("BoardGameGeek isn't ready yet. Try again in a moment."));
  return handler(url, kind);
}
