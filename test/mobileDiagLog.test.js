import { describe, it, expect, vi } from "vitest";
import { createLog, coverSummary } from "../mobile/diagLog.js";

const memStore = (initial) => {
  const m = new Map(initial ? [["mobile_diag_log", initial]] : []);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), raw: () => m.get("mobile_diag_log") };
};

describe("createLog", () => {
  it("records entries in order with a time, and counts repeats instead of filling up", () => {
    let t = 1000;
    const log = createLog({ now: () => t, setTimer: () => 1 });
    log.add("warn", "cover", "Download failed", "https://x/1.jpg");
    t = 2000;
    log.add("warn", "cover", "Download failed");
    log.add("error", "refresh", "Boom");
    const e = log.entries();
    expect(e).toHaveLength(2);
    expect(e[0]).toMatchObject({ level: "warn", source: "cover", count: 2, t: 2000, detail: "https://x/1.jpg" });
    expect(e[1]).toMatchObject({ level: "error", count: 1 });
  });
  it("keeps only the newest entries and clips long text", () => {
    const log = createLog({ max: 3, setTimer: () => 1 });
    for (let i = 0; i < 5; i++) log.add("warn", "s", `m${i}`);
    expect(log.entries().map((x) => x.message)).toEqual(["m2", "m3", "m4"]);
    log.add("error", "s", "x".repeat(1000), "y".repeat(5000));
    const last = log.entries().at(-1);
    expect(last.message.length).toBeLessThanOrEqual(401);
    expect(last.detail.length).toBeLessThanOrEqual(1501);
  });
  it("saves later for ordinary entries but at once for a fatal one, and reloads what was saved", () => {
    const store = memStore();
    const timers = [];
    const log = createLog({ store, setTimer: (fn) => { timers.push(fn); return timers.length; } });
    log.add("warn", "s", "ordinary");
    expect(store.raw()).toBeUndefined();
    timers[0]();
    expect(JSON.parse(store.raw())).toHaveLength(1);
    log.add("fatal", "uncaught", "Crashed");
    expect(JSON.parse(store.raw()).at(-1).message).toBe("Crashed"); // no timer needed
    const again = createLog({ store });
    expect(again.entries().map((e) => e.message)).toEqual(["ordinary", "Crashed"]);
  });
  it("starts empty from a damaged store, and clears", () => {
    expect(createLog({ store: memStore("{not json") }).entries()).toEqual([]);
    const log = createLog({ setTimer: () => 1 });
    log.add("warn", "s", "a");
    log.clear();
    expect(log.entries()).toEqual([]);
  });
  it("counts problems and errors since a time, and tells listeners", () => {
    let t = 100;
    const log = createLog({ now: () => t, setTimer: () => 1 });
    const seen = vi.fn();
    log.subscribe(seen);
    log.add("info", "s", "fine");
    t = 200; log.add("warn", "s", "hmm");
    t = 300; log.add("error", "s", "bad");
    t = 400; log.add("fatal", "s", "dead");
    expect(log.counts(0)).toEqual({ problems: 3, errors: 2, fatal: 1 });
    expect(log.counts(250)).toEqual({ problems: 2, errors: 2, fatal: 1 });
    expect(log.counts(999)).toEqual({ problems: 0, errors: 0, fatal: 0 });
    expect(seen).toHaveBeenCalledTimes(4);
  });
  it("writes a log to send: a header then newest first, with detail indented", () => {
    let t = Date.UTC(2026, 9, 5, 12, 0, 0);
    const log = createLog({ now: () => t, setTimer: () => 1 });
    log.add("warn", "cover", "First", "line1\nline2");
    t += 60_000;
    log.add("error", "refresh", "Second");
    const text = log.toText("The Media Vault v1.0.0 · build 2");
    const lines = text.split("\n");
    expect(lines[0]).toBe("The Media Vault v1.0.0 · build 2");
    expect(lines[2]).toContain("[ERROR] refresh: Second");
    expect(text).toContain("[WARN] cover: First");
    expect(text).toContain("    line1\n    line2");
  });
});

describe("coverSummary", () => {
  it("counts items with and without a cover link per type, biggest type first", () => {
    const out = coverSummary([
      { media_type: "Game", cover_art_url: "u" }, { media_type: "Game", cover_art_url: null }, { media_type: "Game", cover_art_url: "u" },
      { media_type: "Movie", cover_art_url: "u" },
    ]);
    expect(out).toEqual([
      { type: "Game", total: 3, linked: 2, missing: 1 },
      { type: "Movie", total: 1, linked: 1, missing: 0 },
    ]);
    expect(coverSummary(null)).toEqual([]);
  });
});
