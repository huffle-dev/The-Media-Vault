import { describe, it, expect } from "vitest";
import { pickAudibleCoverUrl } from "@media-vault/core/audible";

const r = (title, thumbnailUrl = "http://img/" + title) => ({ title, thumbnailUrl });

describe("pickAudibleCoverUrl", () => {
  it("picks the result with the same title, ignoring case, punctuation and a leading The", () => {
    const results = [r("Something Else"), r("The Name of the Wind")];
    expect(pickAudibleCoverUrl(results, "name of the wind!")).toBe("http://img/The Name of the Wind");
  });
  it("accepts a subtitle on either side", () => {
    expect(pickAudibleCoverUrl([r("Dune: Book One")], "Dune")).toBe("http://img/Dune: Book One");
    expect(pickAudibleCoverUrl([r("Dune")], "Dune: Book One")).toBe("http://img/Dune");
  });
  it("gives nothing rather than a different book's cover", () => {
    expect(pickAudibleCoverUrl([r("Dune Messiah"), r("Children of Dune")], "Dune")).toBeNull();
    expect(pickAudibleCoverUrl([r("Totally Different")], "Dune")).toBeNull();
  });
  it("skips results without an image and handles empty input", () => {
    expect(pickAudibleCoverUrl([{ title: "Dune", thumbnailUrl: null }], "Dune")).toBeNull();
    expect(pickAudibleCoverUrl([], "Dune")).toBeNull();
    expect(pickAudibleCoverUrl(null, "Dune")).toBeNull();
    expect(pickAudibleCoverUrl([r("Dune")], "")).toBeNull();
  });
});
