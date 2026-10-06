import { describe, it, expect } from "vitest";
import { applyFetchedPatch } from "../tokens.js";

describe("applyFetchedPatch", () => {
  it("fills only blank fields when overwrite is false", () => {
    const details = { title: "New Title", creator: "New Creator", year: 2020 };
    const current = { title: "", creator: "Existing Creator", year: null };
    expect(applyFetchedPatch(details, current, { overwrite: false })).toEqual({
      title: "New Title",
      year: 2020,
    });
  });

  it("overwrites every non-blank fetched field when overwrite is true", () => {
    const details = { title: "New Title", creator: "New Creator" };
    const current = { title: "Old Title", creator: "Old Creator" };
    expect(applyFetchedPatch(details, current, { overwrite: true })).toEqual({
      title: "New Title",
      creator: "New Creator",
    });
  });

  it("never lets a blank/null/empty fetched value clear an existing one, even with overwrite", () => {
    const details = { title: null, creator: "", year: undefined };
    const current = { title: "Existing Title", creator: "Existing Creator", year: 1999 };
    expect(applyFetchedPatch(details, current, { overwrite: true })).toEqual({});
  });

  it("skips helper-only keys prefixed with _", () => {
    const details = { title: "T", _thumbnailUrl: "http://example.com/x.jpg" };
    expect(applyFetchedPatch(details, {}, { overwrite: true })).toEqual({ title: "T" });
  });

  it("applies alwaysFresh fields regardless of overwrite or current value", () => {
    const details = { platform_id: "123", creator: "New" };
    const current = { platform_id: "999", creator: "Existing" };
    expect(applyFetchedPatch(details, current, { overwrite: false, alwaysFresh: ["platform_id"] })).toEqual({
      platform_id: "123",
    });
  });

  it("real shape: a Film item's Fetch Info run doesn't drop notes (regression for the bug that motivated this function)", () => {
    const details = {
      title: "Alice in Wonderland", creator: "Clyde Geronimo", notes: "A golden afternoon synopsis…",
      cast_list: "[]", platform_id: "12", metadata_checked_date: "2026-08-10",
    };
    const current = { title: "Alice in Wonderland", creator: "Clyde Geronimo", notes: "", cast_list: null, platform_id: null };
    const patch = applyFetchedPatch(details, current, {
      overwrite: false,
      alwaysFresh: ["platform_id", "cast_list", "metadata_checked_date"],
    });
    expect(patch.notes).toBe("A golden afternoon synopsis…");
    expect(patch.platform_id).toBe("12");
    expect(patch.cast_list).toBe("[]");
    expect(patch.title).toBeUndefined(); // already set, not blank, overwrite is false
  });

  it("real shape: a Board Game's fetch now merges full metadata, not just cover art (regression for the previously-untested gap)", () => {
    const details = {
      title: "Wingspan", creator: "Elizabeth Hargrave", genre: "Strategy",
      player_count: "1-5", complexity: 2.44, bgg_rating: 8.1, bgg_rating_count: 90000,
      _thumbnailUrl: "http://example.com/thumb.jpg", cover_art_path: "/covers/wingspan.jpg",
    };
    const current = { title: "Wingspan", creator: "", genre: "", player_count: "", complexity: "", cover_art_path: null };
    const patch = applyFetchedPatch(details, current, {
      overwrite: false,
      alwaysFresh: ["bgg_rating", "bgg_rating_count"],
    });
    expect(patch.creator).toBe("Elizabeth Hargrave");
    expect(patch.player_count).toBe("1-5");
    expect(patch.complexity).toBe(2.44);
    expect(patch.bgg_rating).toBe(8.1);
    expect(patch.cover_art_path).toBe("/covers/wingspan.jpg");
    expect(patch._thumbnailUrl).toBeUndefined();
  });
});
