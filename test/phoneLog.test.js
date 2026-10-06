import { describe, it, expect } from "vitest";
import { PHONE_LOG_KEY, MAX_CHARS, buildPhoneLogRow, formatPhoneLog, unseenCrash } from "@media-vault/core/phoneLog";

describe("buildPhoneLogRow", () => {
  it("makes the app_settings row with the text and where it came from", () => {
    const row = buildPhoneLogRow("log text", { version: "1.0.0", build: 4, device: "Android 14" }, () => "2026-10-05T20:00:00Z");
    expect(row).toEqual({ key: PHONE_LOG_KEY, value: { text: "log text", version: "1.0.0", build: 4, device: "Android 14", sentAt: "2026-10-05T20:00:00Z" } });
  });
  it("cuts a huge log off rather than sending it all", () => {
    const row = buildPhoneLogRow("x".repeat(MAX_CHARS + 500));
    expect(row.value.text.length).toBeLessThan(MAX_CHARS + 50);
    expect(row.value.text).toMatch(/cut off/);
    expect(buildPhoneLogRow(null).value.text).toBe("");
  });
});

describe("formatPhoneLog", () => {
  it("puts a one-line header above the log", () => {
    const out = formatPhoneLog({ text: "BODY", sentAt: "T", version: "1.0.0", build: 4, device: "Pixel" });
    expect(out).toBe("Phone log sent T · App v1.0.0 build 4 · Device: Pixel\n\nBODY");
  });
  it("is null when nothing usable was sent", () => {
    expect(formatPhoneLog(null)).toBeNull();
    expect(formatPhoneLog({})).toBeNull();
  });
});

describe("unseenCrash", () => {
  const entries = [{ level: "warn", t: 1 }, { level: "fatal", t: 100, message: "boom" }, { level: "warn", t: 200 }];
  it("finds the last crash the person has not carried on past", () => {
    expect(unseenCrash(entries, 0)).toMatchObject({ message: "boom" });
    expect(unseenCrash(entries, 99)).toMatchObject({ message: "boom" });
  });
  it("is null once they carried on, or when there was no crash", () => {
    expect(unseenCrash(entries, 100)).toBeNull();
    expect(unseenCrash([{ level: "error", t: 5 }], 0)).toBeNull();
    expect(unseenCrash(null)).toBeNull();
  });
  it("looks at the NEWEST crash only", () => {
    const two = [{ level: "fatal", t: 10 }, { level: "fatal", t: 50 }];
    expect(unseenCrash(two, 20)).toMatchObject({ t: 50 });
    expect(unseenCrash(two, 60)).toBeNull();
  });
});
