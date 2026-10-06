import { describe, it, expect } from "vitest";
import { BGG_WARNING, BGG_NOTICE_KEY } from "@media-vault/core/bggWarning.js";

describe("BoardGameGeek notice", () => {
  it("says plainly that it is unofficial and could stop working", () => {
    const text = BGG_WARNING.join(" ");
    expect(text).toMatch(/unofficial/);
    expect(text).toMatch(/stop working/);
    expect(text).toMatch(/hidden browser/);
  });
  it("is remembered under one stable key", () => {
    expect(BGG_NOTICE_KEY).toBe("bgg_notice_accepted");
  });
});
