import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { fetchWithTimeout } from "@media-vault/core/fetchWithTimeout";

let server;
let base;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/ok") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ hello: "world" }));
    } else if (req.url === "/hang") {
      // Never responds — the request the whole feature exists to bound.
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
});

describe("fetchWithTimeout", () => {
  it("resolves normally for a fast response", async () => {
    const res = await fetchWithTimeout(`${base}/ok`);
    expect(res.ok).toBe(true);
    expect(await res.json()).toEqual({ hello: "world" });
  });

  it("passes options through unchanged (e.g. headers)", async () => {
    const res = await fetchWithTimeout(`${base}/ok`, { headers: { "X-Test": "1" } });
    expect(res.ok).toBe(true);
  });

  it("aborts a stalled request once the timeout elapses", async () => {
    await expect(fetchWithTimeout(`${base}/hang`, {}, 50)).rejects.toThrow();
  });

  it("still aborts if the caller already passed its own signal", async () => {
    const controller = new AbortController();
    await expect(fetchWithTimeout(`${base}/hang`, { signal: controller.signal }, 50)).rejects.toThrow();
  });

  it("respects a caller's own signal aborting before the timeout", async () => {
    const controller = new AbortController();
    const promise = fetchWithTimeout(`${base}/hang`, { signal: controller.signal }, 10000);
    controller.abort();
    await expect(promise).rejects.toThrow();
  });
});
