import { describe, it, expect } from "vitest";
import { buildOwnedChangePatch } from "@media-vault/core/tokens/ratings.js";

describe("buildOwnedChangePatch", () => {
  it("marking a wishlist item owned moves it to not-started", () => {
    expect(buildOwnedChangePatch({ status: "wishlist" }, true)).toEqual({ is_local: 1, status: "not-started" });
  });

  it("marking a not-started item not owned moves it back to wishlist", () => {
    expect(buildOwnedChangePatch({ status: "not-started" }, false)).toEqual({ is_local: 0, status: "wishlist" });
  });

  it("leaves other statuses untouched", () => {
    expect(buildOwnedChangePatch({ status: "consumed" }, true)).toEqual({ is_local: 1 });
    expect(buildOwnedChangePatch({ status: "in-progress" }, false)).toEqual({ is_local: 0 });
  });
});
