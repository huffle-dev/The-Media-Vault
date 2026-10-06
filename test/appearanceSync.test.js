import { describe, it, expect } from "vitest";
import { buildAppearancePayload, cleanAppearancePayload, APPEARANCE_KEY } from "../packages/core/appearanceSync.js";

const settings = (o) => (k) => o[k] ?? null;

describe("buildAppearancePayload", () => {
  it("is null when nothing was customised", () => {
    expect(buildAppearancePayload(settings({}))).toBeNull();
    expect(buildAppearancePayload(settings({ appearance_accent: "", appearance_status_colors: "" }))).toBeNull();
  });
  it("gathers the accent, status colours and type styles that were saved", () => {
    const p = buildAppearancePayload(settings({
      appearance_accent: "#112233",
      appearance_status_colors: JSON.stringify({ seen: "#00ff00" }),
      appearance_type_styles: JSON.stringify({ Movie: { color: "#ff0000", icon: "🎬" } }),
      appearance_font_pair: "classic",
    }));
    expect(p).toEqual({ accent: "#112233", statusColors: { seen: "#00ff00" }, typeStyles: { Movie: { color: "#ff0000", icon: "🎬" } } });
  });
  it("ignores a setting that isn't valid JSON instead of throwing", () => {
    expect(buildAppearancePayload(settings({ appearance_status_colors: "{oops" }))).toBeNull();
  });
});

describe("cleanAppearancePayload (the server's data is not trusted)", () => {
  it("keeps good colours and icons", () => {
    const raw = { accent: "#AABBCC", statusColors: { blue: "#5b8ff5" }, typeStyles: { Book: { color: "#123456", icon: "📚" } } };
    expect(cleanAppearancePayload(raw)).toEqual(raw);
  });
  it("drops anything that isn't a six-digit hex colour or a short icon", () => {
    const out = cleanAppearancePayload({
      accent: "red", statusColors: { seen: "javascript:1", bogus: "#ffffff", dropped: "#e5384a" },
      typeStyles: { Game: { color: "#12", icon: "x".repeat(40) }, Music: { color: "#abcdef", icon: "" }, Bad: 5 },
    });
    expect(out).toEqual({ statusColors: { dropped: "#e5384a" }, typeStyles: { Music: { color: "#abcdef" } } });
  });
  it("copes with null and non-objects", () => {
    expect(cleanAppearancePayload(null)).toEqual({});
    expect(cleanAppearancePayload("x")).toEqual({});
  });
  it("uses the row key the table expects", () => expect(APPEARANCE_KEY).toBe("appearance"));
});
