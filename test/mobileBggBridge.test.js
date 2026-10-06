import { describe, it, expect, vi } from "vitest";
import { buildRequestScript, parseBridgeMessage, createBridge } from "../mobile/bggBridge.js";
import { bggSearch, bggDetails } from "../mobile/bgg.js";

describe("buildRequestScript / parseBridgeMessage", () => {
  it("builds a script that fetches the address and answers with the same id", () => {
    const script = buildRequestScript(7, 'https://x.test/a?b="c"', "json");
    expect(script).toContain('fetch("https://x.test/a?b=\\"c\\"")');
    expect(script).toContain("r.json()");
    expect(script).toContain("id: 7");
    expect(buildRequestScript(1, "https://x", "text")).toContain("r.text()");
    expect(() => new Function(script)).not.toThrow(); // it is valid JavaScript
  });
  it("only accepts messages in our own shape", () => {
    expect(parseBridgeMessage('{"id":3,"ok":true,"body":"x"}')).toEqual({ id: 3, ok: true, body: "x" });
    expect(parseBridgeMessage("not json")).toBeNull();
    expect(parseBridgeMessage('{"ok":true}')).toBeNull();
    expect(parseBridgeMessage('{"id":"3","ok":true}')).toBeNull();
    expect(parseBridgeMessage(null)).toBeNull();
  });
});

describe("createBridge", () => {
  const make = () => {
    const sent = [];
    const timers = [];
    const bridge = createBridge({ send: (s) => sent.push(s), setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: vi.fn() });
    return { bridge, sent, timers };
  };
  it("matches each answer to its request, even out of order", async () => {
    const { bridge, sent } = make();
    const a = bridge.request("https://a", "text");
    const b = bridge.request("https://b", "json");
    expect(sent).toHaveLength(2);
    bridge.receive(JSON.stringify({ id: 2, ok: true, body: { b: 1 } }));
    bridge.receive(JSON.stringify({ id: 1, ok: true, body: "A" }));
    expect(await b).toEqual({ b: 1 });
    expect(await a).toBe("A");
    expect(bridge.size).toBe(0);
  });
  it("rejects with the page's error, on a timeout, and when everything is failed at once", async () => {
    const { bridge, timers } = make();
    const bad = bridge.request("https://a", "text");
    bridge.receive(JSON.stringify({ id: 1, ok: false, error: "HTTP 403" }));
    await expect(bad).rejects.toThrow("HTTP 403");
    const slow = bridge.request("https://b", "text");
    timers.at(-1).fn();
    await expect(slow).rejects.toThrow(/took too long/);
    const lost = bridge.request("https://c", "text");
    bridge.failAll("The page went away");
    await expect(lost).rejects.toThrow("The page went away");
  });
  it("ignores answers it did not ask for", () => {
    const { bridge } = make();
    expect(() => bridge.receive(JSON.stringify({ id: 99, ok: true, body: "x" }))).not.toThrow();
    expect(() => bridge.receive("junk")).not.toThrow();
  });
});

describe("bggSearch / bggDetails over a fake page fetcher", () => {
  it("searches by name and parses the results table", async () => {
    let asked;
    const html = '<tr><td class="collection_thumbnail"><img src="t.jpg"></td><td class="collection_objectname"><a href="/boardgame/13/catan">Catan</a><span class="smallerfont">(1995)</span></td></tr>';
    const out = await bggSearch("catan & co", async (url, kind) => { asked = { url, kind }; return html; });
    expect(asked.url).toContain("q=catan%20%26%20co");
    expect(asked.kind).toBe("text");
    expect(out[0]).toMatchObject({ platformId: "13", title: "Catan (1995)" });
  });
  it("words a failed search", async () => {
    await expect(bggSearch("x", async () => { throw new Error("HTTP 403"); })).rejects.toThrow(/BGG search failed \(HTTP 403\)/);
  });
  it("gets details and stats together, and survives missing stats", async () => {
    const fetchPage = async (url) => (url.includes("dynamicinfo") ? Promise.reject(new Error("nope")) : { item: { name: "Catan", yearpublished: "1995" } });
    expect(await bggDetails(13, "Board Game", fetchPage)).toMatchObject({ title: "Catan", year: 1995, platform_id: "13", complexity: null });
  });
});
