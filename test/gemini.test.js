import { describe, it, expect } from "vitest";
import { SCAN_PROMPT, generateJson, scanImageBase64, cleanScanItems } from "@media-vault/core/gemini";

const reply = (data) => async () => ({ json: async () => data });
const text = (obj) => ({ candidates: [{ content: { parts: [{ text: typeof obj === "string" ? obj : JSON.stringify(obj) }] } }] });
const errs = { noContent: "NO CONTENT", unparseable: "UNPARSEABLE" };

describe("generateJson", () => {
  it("sends the key in a header and the parts as a JSON request, and parses the answer", async () => {
    let seen;
    const out = await generateJson([{ text: "hi" }], "KEY", 1000, errs, async (url, opts, timeout) => { seen = { url, opts, timeout }; return { json: async () => text([{ a: 1 }]) }; });
    expect(out).toEqual([{ a: 1 }]);
    expect(seen.opts.headers["X-goog-api-key"]).toBe("KEY");
    expect(JSON.parse(seen.opts.body).contents[0].parts[0].text).toBe("hi");
    expect(seen.timeout).toBe(1000);
  });
  it("words each failure", async () => {
    await expect(generateJson([], "k", 1, errs, reply({ error: { message: "quota" } }))).rejects.toThrow("Gemini: quota");
    await expect(generateJson([], "k", 1, errs, reply({ candidates: [] }))).rejects.toThrow("NO CONTENT");
    await expect(generateJson([], "k", 1, errs, reply(text("not json")))).rejects.toThrow("UNPARSEABLE");
  });
});

describe("scanImageBase64", () => {
  it("needs a key, sends the prompt and image, and wants a list back", async () => {
    await expect(scanImageBase64("b64", "image/jpeg", null)).rejects.toThrow(/No Gemini API key/);
    let body;
    const items = await scanImageBase64("b64", "image/jpeg", "k", async (u, o) => { body = JSON.parse(o.body); return { json: async () => text([{ title: "Dune" }]) }; });
    expect(items).toEqual([{ title: "Dune" }]);
    expect(body.contents[0].parts[0].text).toBe(SCAN_PROMPT);
    expect(body.contents[0].parts[1].inline_data).toEqual({ mime_type: "image/jpeg", data: "b64" });
    await expect(scanImageBase64("b", "image/png", "k", reply(text({ not: "a list" })))).rejects.toThrow(/Unexpected response shape/);
  });
});

describe("cleanScanItems", () => {
  it("keeps titled entries, fixes unsupported types and confidence", () => {
    expect(cleanScanItems([
      { title: "  Dune  ", media_type: "Book", confidence: "high", note: "spine" },
      { title: "Catan", media_type: "Board Game" },
      { title: null, media_type: "Movie" },
      { title: "  " },
      null,
      { title: "Hades", media_type: "Game", confidence: "sure" },
    ])).toEqual([
      { title: "Dune", media_type: "Book", confidence: "high", note: "spine" },
      { title: "Catan", media_type: "Movie", confidence: "medium", note: null },
      { title: "Hades", media_type: "Game", confidence: "medium", note: null },
    ]);
    expect(cleanScanItems("junk")).toEqual([]);
  });
});
