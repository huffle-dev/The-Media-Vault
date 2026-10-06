import { describe, it, expect } from "vitest";
import htmlText from "@media-vault/core/htmlText";
const { decodeHtmlEntities, stripHtml } = htmlText;

describe("decodeHtmlEntities", () => {
  it("decodes the named entity form of an apostrophe (real podcast RSS case)", () => {
    expect(decodeHtmlEntities("we&apos;ve arrived")).toBe("we've arrived");
  });

  it("decodes the numeric entity forms too", () => {
    expect(decodeHtmlEntities("we&#39;ve or we&#039;ve")).toBe("we've or we've");
  });

  it("decodes amp/lt/gt/quot", () => {
    expect(decodeHtmlEntities("Tom &amp; Jerry &lt;3 &quot;fun&quot; &gt; work")).toBe('Tom & Jerry <3 "fun" > work');
  });

  it("leaves plain text with no entities unchanged", () => {
    expect(decodeHtmlEntities("Nothing to decode here")).toBe("Nothing to decode here");
  });
});

describe("stripHtml", () => {
  it("strips real GOG-style markup and collapses whitespace", () => {
    expect(stripHtml("<p>A <b>bold</b> game.<br>Second line.</p>")).toBe("A bold game. Second line.");
  });

  it("decodes entities after stripping tags", () => {
    expect(stripHtml("<p>Tom &amp; Jerry&nbsp;forever</p>")).toBe("Tom & Jerry forever");
  });

  it("trims leading/trailing whitespace left behind by stripped tags", () => {
    expect(stripHtml("  <div>  Padded  </div>  ")).toBe("Padded");
  });
});
