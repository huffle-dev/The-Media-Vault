import { describe, it, expect } from "vitest";
import textEncoding from "@media-vault/core/textEncoding";
const { decodeCp1252 } = textEncoding;

describe("decodeCp1252", () => {
  it("decodes CP1252 high-range bytes to their real characters", () => {
    // 0x93/0x94 = curly double quotes, 0x96 = en-dash
    const buffer = Buffer.from([0x93, 0x41, 0x94, 0x20, 0x96]);
    expect(decodeCp1252(buffer)).toBe("“A” –");
  });

  it("decodes a real mojibake case: a curly apostrophe in a title", () => {
    // "Assassin" + 0x92 (’) + "s Apprentice"
    const buffer = Buffer.from("Assassin", "latin1");
    const withApostrophe = Buffer.concat([buffer, Buffer.from([0x92]), Buffer.from("s Apprentice", "latin1")]);
    expect(decodeCp1252(withApostrophe)).toBe("Assassin’s Apprentice");
  });

  it("passes plain ASCII bytes through unchanged", () => {
    const buffer = Buffer.from("Plain ASCII Title 123", "latin1");
    expect(decodeCp1252(buffer)).toBe("Plain ASCII Title 123");
  });

  it("falls back to the raw byte's char code for anything outside the high-range table", () => {
    const buffer = Buffer.from([0x81]); // unassigned in CP1252
    expect(decodeCp1252(buffer)).toBe(String.fromCharCode(0x81));
  });
});
