import { describe, it, expect } from "vitest";
import { makeLane } from "../mobile/lane.js";

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

describe("makeLane", () => {
  it("never runs more than max at once", async () => {
    const lane = makeLane(2);
    let running = 0, peak = 0;
    const task = () => new Promise((r) => { running++; peak = Math.max(peak, running); setTimeout(() => { running--; r(1); }, 5); });
    await Promise.all(Array.from({ length: 8 }, () => lane(task)));
    expect(peak).toBe(2);
  });

  it("serves the newest waiting request first", async () => {
    const lane = makeLane(1);
    const gate = deferred();
    const order = [];
    const first = lane(() => gate.promise.then(() => order.push("first")));
    const a = lane(async () => order.push("a"));
    const b = lane(async () => order.push("b"));
    const c = lane(async () => order.push("c"));
    gate.resolve();
    await Promise.all([first, a, b, c]);
    expect(order).toEqual(["first", "c", "b", "a"]);
  });

  it("skips a request that was cancelled before its turn", async () => {
    const lane = makeLane(1);
    const gate = deferred();
    let ran = false;
    const first = lane(() => gate.promise);
    const skipped = lane(async () => { ran = true; return "x"; }, () => true);
    gate.resolve();
    await first;
    expect(await skipped).toBeUndefined();
    expect(ran).toBe(false);
  });

  it("a rejected task does not stall the lane", async () => {
    const lane = makeLane(1);
    const bad = lane(() => Promise.reject(new Error("boom")));
    const good = lane(async () => "ok");
    await expect(bad).rejects.toThrow("boom");
    expect(await good).toBe("ok");
  });
});
