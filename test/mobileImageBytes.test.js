import { describe, it, expect } from "vitest";
import { looksLikeImage } from "../mobile/imageBytes.js";

const bytes = (...b) => Uint8Array.from([...b, ...new Array(Math.max(0, 16 - b.length)).fill(0)]);

describe("looksLikeImage", () => {
  it("accepts the start of a JPEG, PNG, GIF and WEBP", () => {
    expect(looksLikeImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(looksLikeImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a))).toBe(true);
    expect(looksLikeImage(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBe(true);
    expect(looksLikeImage(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe(true);
  });
  it("also accepts AVIF/HEIC, BMP and ICO so an unusual but real picture is never thrown away", () => {
    expect(looksLikeImage(bytes(0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66))).toBe(true);
    expect(looksLikeImage(bytes(0x42, 0x4d, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0))).toBe(true);
    expect(looksLikeImage(bytes(0, 0, 1, 0, 1, 0, 16, 16))).toBe(true);
  });
  it("refuses an error page, an empty body and a RIFF file that is not WEBP", () => {
    expect(looksLikeImage(new TextEncoder().encode("<html><body>404 Not Found</body></html>"))).toBe(false);
    expect(looksLikeImage(new Uint8Array(0))).toBe(false);
    expect(looksLikeImage(null)).toBe(false);
    expect(looksLikeImage(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45))).toBe(false); // WAVE
    expect(looksLikeImage(bytes(0xff))).toBe(false); // too short to tell
  });
});
