import { describe, it, expect } from "vitest";
import { coverAspectFor, coverObjectPath, replaceCover } from "../mobile/coverUpload.js";

function fakeClient({ uploadError = null, updateError = null } = {}) {
  const log = [];
  const client = {
    log,
    storage: {
      from: (bucket) => ({
        upload: async (path, bytes, opts) => { log.push(["upload", bucket, path, opts]); return { error: uploadError }; },
        getPublicUrl: (path) => ({ data: { publicUrl: `https://srv/storage/v1/object/public/${bucket}/${path}` } }),
        remove: async (paths) => { log.push(["remove", bucket, paths]); return { error: null }; },
      }),
    },
    from: (table) => ({
      update: (patch) => ({ eq: async (col, id) => { log.push(["update", table, patch, id]); return { error: updateError }; } }),
    }),
  };
  return client;
}
const item = { sync_id: "item-1", cover_art_url: "https://old/x.jpg" };

describe("coverAspectFor", () => {
  it("is wide for videos, square for square art, tall otherwise", () => {
    expect(coverAspectFor({ wideArt: true, squareArt: false })).toEqual([16, 9]);
    expect(coverAspectFor({ wideArt: false, squareArt: true })).toEqual([1, 1]);
    expect(coverAspectFor({ wideArt: false, squareArt: false })).toEqual([2, 3]);
  });
});

describe("coverObjectPath", () => {
  it("is in the user's own folder and unique per replacement", () => {
    expect(coverObjectPath("u1", "i1", 100)).toBe("u1/i1-100.jpg");
    expect(coverObjectPath("u1", "i1", 101)).not.toBe(coverObjectPath("u1", "i1", 100));
  });
});

describe("replaceCover", () => {
  it("uploads, points the item at the new picture, and undo puts the old link back", async () => {
    const c = fakeClient();
    const { url, undo } = await replaceCover({ client: c, userId: "u1", item, bytes: new Uint8Array([1]), now: 5 });
    expect(url).toBe("https://srv/storage/v1/object/public/covers/u1/item-1-5.jpg");
    expect(c.log[0]).toEqual(["upload", "covers", "u1/item-1-5.jpg", { contentType: "image/jpeg", upsert: false }]);
    expect(c.log[1][0]).toBe("update");
    expect(c.log[1][2]).toMatchObject({ cover_art_url: url });
    expect(c.log[1][3]).toBe("item-1");
    c.log.length = 0;
    await undo();
    expect(c.log[0][2]).toMatchObject({ cover_art_url: "https://old/x.jpg" });
    expect(c.log[1]).toEqual(["remove", "covers", ["u1/item-1-5.jpg"]]);
  });
  it("explains a storage-rule refusal in plain words and changes nothing", async () => {
    const c = fakeClient({ uploadError: { message: "new row violates row-level security policy" } });
    await expect(replaceCover({ client: c, userId: "u1", item, bytes: new Uint8Array(), now: 1 })).rejects.toThrow(/storage rules/);
    expect(c.log.some((l) => l[0] === "update")).toBe(false);
  });
  it("removes the uploaded picture again if saving the link fails", async () => {
    const c = fakeClient({ updateError: { message: "offline" } });
    await expect(replaceCover({ client: c, userId: "u1", item, bytes: new Uint8Array(), now: 2 })).rejects.toThrow("offline");
    expect(c.log.at(-1)).toEqual(["remove", "covers", ["u1/item-1-2.jpg"]]);
  });
});
