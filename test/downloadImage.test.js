import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import downloadImageModule from "../lib/downloadImage.js";
const { downloadImage } = downloadImageModule;

// A local server rather than a real CDN — these assert downloadImage's own
// settle/cleanup behaviour, which shouldn't depend on the network.
let server;
let base;
let tmpDir;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/missing") {
      // Deliberately no body-ending niceties beyond the norm: the point is
      // that the caller never reads this body.
      res.writeHead(404, { "Content-Type": "text/html" });
      res.end("not found");
    } else if (req.url === "/image") {
      res.writeHead(200, { "Content-Type": "image/jpeg" });
      res.end(Buffer.from("fake-image-bytes"));
    } else {
      res.writeHead(500);
      res.end();
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vault-dl-test-"));
});

afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("downloadImage", () => {
  it("saves a successful download and resolves with the destination path", async () => {
    const dest = path.join(tmpDir, "ok.jpg");
    await expect(downloadImage(`${base}/image`, dest)).resolves.toBe(dest);
    expect(fs.existsSync(dest)).toBe(true);
  });

  it("rejects a non-200 and leaves no partial file behind", async () => {
    const dest = path.join(tmpDir, "missing.jpg");
    await expect(downloadImage(`${base}/missing`, dest)).rejects.toThrow("HTTP 404");
    expect(fs.existsSync(dest)).toBe(false);
  });

  // The regression this file exists for: a failed request must never reach
  // back and delete a file that a later, successful download wrote to the
  // same path. Previously the non-2xx response body was left unconsumed, so
  // the request stayed alive and its timeout fired long after the promise
  // rejected — destroying the request, re-running cleanup(), and deleting
  // whatever now sat at `dest`.
  it("a failed download does not delete a file a later download wrote to the same path", async () => {
    const dest = path.join(tmpDir, "shared-path.jpg");

    await expect(downloadImage(`${base}/missing`, dest)).rejects.toThrow();
    await expect(downloadImage(`${base}/image`, dest)).resolves.toBe(dest);

    // Give any stray late handler from the failed request a chance to run.
    await new Promise(r => setTimeout(r, 250));
    expect(fs.existsSync(dest)).toBe(true);
    expect(fs.readFileSync(dest).toString()).toBe("fake-image-bytes");
  });
});
