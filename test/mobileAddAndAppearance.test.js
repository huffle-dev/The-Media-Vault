import { describe, it, expect, vi, beforeEach } from "vitest";

// The phone's Supabase client and cover-art storage pull in Expo modules, so
// these tests swap them for fakes.
const inserted = [];
let insertError = null;
let appearanceRow = { data: null, error: null };
vi.mock("../mobile/supabase", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: (table) => ({
      insert: async (row) => { inserted.push({ table, row }); return { error: insertError }; },
      select: () => ({ eq: () => ({ maybeSingle: async () => appearanceRow }) }),
    }),
  },
}));
vi.mock("../mobile/coverArtStorage", () => ({ getCoverArtSourceUrl: (uri) => (uri === "file:///a.jpg" ? "https://img.example/a.jpg" : null) }));
vi.mock("../mobile/mediaServices", () => ({ movie: {}, openLibrary: {}, audible: {}, podcast: {}, discogs: {}, steam: {}, igdb: {}, youtube: {} }));

const { uuidv4, addItemToLibrary } = await import("../mobile/addToLibrary.js");
const { workPosterUrl } = await import("../mobile/addExternalWork.js");
const { applyAppearance, syncAppearance } = await import("../mobile/appearance.js");
const { DEFAULT_STATUS_COLORS, T } = await import("../packages/core/tokens/theme.js");
const { MEDIA_TYPES } = await import("../packages/core/tokens/mediaTypes.js");
const { C } = await import("../mobile/colors.js");

beforeEach(() => { inserted.length = 0; insertError = null; appearanceRow = { data: null, error: null }; });

describe("uuidv4", () => {
  it("makes version-4 ids that differ each time", () => {
    const a = uuidv4(), b = uuidv4();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
});

describe("addItemToLibrary", () => {
  it("adds a wishlist item for the signed-in user with the fetched details and cover link", async () => {
    await addItemToLibrary({
      mediaType: "Book", title: "Dune", platformId: "OL1",
      details: { title: "Dune", creator: "Frank Herbert", year: 1965, cover_art_path: "file:///a.jpg", cover_art_secret: "not synced" },
    });
    const { table, row } = inserted[0];
    expect(table).toBe("items");
    expect(row).toMatchObject({ user_id: "user-1", title: "Dune", media_type: "Book", status: "wishlist", platform_id: "OL1", creator: "Frank Herbert", year: 1965, cover_art_url: "https://img.example/a.jpg" });
    expect(row).not.toHaveProperty("cover_art_path");
    expect(row).not.toHaveProperty("cover_art_secret");
    expect(row.sync_id).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("uses the bare search-result fields when no details were fetched", async () => {
    await addItemToLibrary({ mediaType: "Movie", title: "Heat", platformId: "tt1", quickRow: { title: "Heat (1995)", year: 1995 } });
    expect(inserted[0].row).toMatchObject({ title: "Heat (1995)", year: 1995, cover_art_url: null });
  });
  it("throws when the server refuses", async () => {
    insertError = new Error("row-level security");
    await expect(addItemToLibrary({ mediaType: "Book", title: "X", platformId: "1" })).rejects.toThrow("row-level security");
  });
});

describe("workPosterUrl", () => {
  it("prefers a TMDB poster, then an Open Library cover id, then a plain link", () => {
    expect(workPosterUrl({ poster_path: "/p.jpg", coverId: 5, coverUrl: "u" })).toBe("https://image.tmdb.org/t/p/w342/p.jpg");
    expect(workPosterUrl({ coverId: 5, coverUrl: "u" })).toBe("https://covers.openlibrary.org/b/id/5-M.jpg");
    expect(workPosterUrl({ coverUrl: "u" })).toBe("u");
    expect(workPosterUrl({})).toBeNull();
  });
});

describe("applying the desktop's appearance on the phone", () => {
  it("recolours the accent, status colours and a type, ignoring bad values", () => {
    const movieBefore = MEDIA_TYPES.find((m) => m.label === "Movie");
    const applied = applyAppearance({
      accent: "#112233", statusColors: { seen: "#00ff00", dropped: "nope" },
      typeStyles: { Movie: { color: "#ff0000", icon: "🎞" } },
    });
    expect(applied).toBe(true);
    expect(T.accent).toBe("#112233");
    expect(C.accent).toBe("#112233");
    expect(DEFAULT_STATUS_COLORS.seen).toBe("#00ff00");
    expect(C.seen).toBe("#00ff00");
    expect(DEFAULT_STATUS_COLORS.dropped).toBe("#e5384a"); // the bad one was ignored
    expect(movieBefore.color).toBe("#ff0000");
    expect(movieBefore.icon).toBe("🎞");
  });
  it("does nothing for an empty or junk payload", () => {
    expect(applyAppearance({})).toBe(false);
    expect(applyAppearance(null)).toBe(false);
  });
  it("syncAppearance applies the saved row, and quietly does nothing when there is none or it fails", async () => {
    appearanceRow = { data: { value: { accent: "#abcdef" } }, error: null };
    expect(await syncAppearance()).toBe(true);
    expect(C.accent).toBe("#abcdef");
    appearanceRow = { data: null, error: null };
    expect(await syncAppearance()).toBe(false);
    appearanceRow = { data: null, error: new Error("relation app_settings does not exist") };
    expect(await syncAppearance()).toBe(false);
  });
  it("reads a row whose value came back as text", async () => {
    appearanceRow = { data: { value: JSON.stringify({ accent: "#fedcba" }) }, error: null };
    expect(await syncAppearance()).toBe(true);
    expect(T.accent).toBe("#fedcba");
  });
});
