import { describe, it, expect } from "vitest";
import { latestUpdatedAt, mergeItemChanges, byTitle } from "../mobile/libraryMerge.js";
import { timeAgo } from "../mobile/format.js";

const row = (id, title, updated_at, extra = {}) => ({ sync_id: id, title, updated_at, status: "wishlist", ...extra });

describe("latestUpdatedAt", () => {
  it("returns the newest value as its original string", () => {
    const items = [row("a", "A", "2026-10-01T10:00:00.123456+00:00"), row("b", "B", "2026-10-03T08:00:00.654321+00:00"), row("c", "C", "2026-10-02T09:00:00+00:00")];
    expect(latestUpdatedAt(items)).toBe("2026-10-03T08:00:00.654321+00:00");
  });
  it("is null for an empty list or rows cached before updated_at was fetched", () => {
    expect(latestUpdatedAt([])).toBeNull();
    expect(latestUpdatedAt(null)).toBeNull();
    expect(latestUpdatedAt([{ sync_id: "a", title: "A" }])).toBeNull();
  });
  it("ignores unparseable values", () => {
    expect(latestUpdatedAt([row("a", "A", "garbage"), row("b", "B", "2026-10-01T00:00:00Z")])).toBe("2026-10-01T00:00:00Z");
  });
});

describe("mergeItemChanges", () => {
  const base = [row("a", "Alpha", "2026-10-01T00:00:00Z"), row("b", "Beta", "2026-10-01T00:00:00Z"), row("c", "Gamma", "2026-10-01T00:00:00Z")];

  it("replaces an edited row", () => {
    const { items, changed } = mergeItemChanges(base, [row("b", "Beta", "2026-10-02T00:00:00Z", { status: "consumed" })]);
    expect(items.find((i) => i.sync_id === "b").status).toBe("consumed");
    expect(items).toHaveLength(3);
    expect(changed).toBe(1);
  });
  it("adds a new row in title order", () => {
    const { items } = mergeItemChanges(base, [row("d", "Beta Two", "2026-10-02T00:00:00Z")]);
    expect(items.map((i) => i.title)).toEqual(["Alpha", "Beta", "Beta Two", "Gamma"]);
  });
  it("removes a row that was deleted, and ignores a deletion for one it never had", () => {
    const { items, changed } = mergeItemChanges(base, [{ ...row("a", "Alpha", "2026-10-02T00:00:00Z"), deleted_at: "2026-10-02T00:00:00Z" }, { ...row("zzz", "Ghost", "2026-10-02T00:00:00Z"), deleted_at: "x" }]);
    expect(items.map((i) => i.sync_id)).toEqual(["b", "c"]);
    expect(changed).toBe(1);
  });
  it("strips deleted_at from kept rows and re-sorts when a title changes", () => {
    const { items } = mergeItemChanges(base, [{ ...row("a", "Zeta", "2026-10-02T00:00:00Z"), deleted_at: null }]);
    expect(items.map((i) => i.title)).toEqual(["Beta", "Gamma", "Zeta"]);
    expect("deleted_at" in items[2]).toBe(false);
  });
  it("is idempotent: applying the same changes again changes nothing", () => {
    const changes = [row("b", "Beta", "2026-10-02T00:00:00Z", { status: "consumed" }), row("d", "Delta", "2026-10-02T00:00:00Z")];
    const once = mergeItemChanges(base, changes);
    const twice = mergeItemChanges(once.items, changes);
    expect(twice.items).toEqual(once.items);
    expect(twice.changed).toBe(0);
  });
  it("tolerates empty or missing inputs and rows without a sync_id", () => {
    expect(mergeItemChanges(null, null).items).toEqual([]);
    expect(mergeItemChanges(base, [{ title: "no id" }, null]).items).toHaveLength(3);
  });
  it("sorts titles case-insensitively", () => {
    expect([row("1", "banana"), row("2", "Apple"), row("3", "cherry")].sort(byTitle).map((i) => i.title)).toEqual(["Apple", "banana", "cherry"]);
  });
});

describe("timeAgo", () => {
  const now = Date.parse("2026-10-05T12:00:00Z");
  it("reads naturally at each scale", () => {
    expect(timeAgo(now - 10_000, now)).toBe("just now");
    expect(timeAgo(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(timeAgo(now - 3 * 3600_000, now)).toBe("3 h ago");
    expect(timeAgo(now - 24 * 3600_000, now)).toBe("1 day ago");
    expect(timeAgo(now - 4 * 24 * 3600_000, now)).toBe("4 days ago");
  });
  it("is null for a missing time and never negative", () => {
    expect(timeAgo(null, now)).toBeNull();
    expect(timeAgo(now + 60_000, now)).toBe("just now");
  });
});
