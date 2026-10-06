import { describe, it, expect } from "vitest";
import { isPrivateAddress, isInternalHostName, extractMeta, parseWebsiteHtml } from "@media-vault/core/websiteParse";

const page = new URL("https://www.example.com/post");

describe("isPrivateAddress", () => {
  it("flags loopback, private, link-local and malformed addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.1", "192.168.1.5", "169.254.169.254", "0.0.0.0", "::1", "fe80::1", "fd00::1", "::ffff:10.0.0.1", "999", "1.2.3"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });
  it("lets public addresses through", () => {
    for (const ip of ["8.8.8.8", "172.32.0.1", "93.184.216.34", "2606:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });
});

describe("isInternalHostName (no DNS lookup)", () => {
  it("blocks internal names and private IP literals", () => {
    for (const h of ["localhost", "printer.local", "db.internal", "nas", "192.168.0.10", "[::1]", "169.254.169.254", ""]) expect(isInternalHostName(h), h).toBe(true);
  });
  it("allows ordinary public names and addresses", () => {
    for (const h of ["example.com", "www.bbc.co.uk", "8.8.8.8"]) expect(isInternalHostName(h), h).toBe(false);
  });
});

describe("extractMeta", () => {
  it("reads either attribute order", () => {
    expect(extractMeta('<meta property="og:title" content="A">', "property", "og:title")).toBe("A");
    expect(extractMeta("<meta content='B' name='description'>", "name", "description")).toBe("B");
    expect(extractMeta("<p>nothing</p>", "name", "description")).toBeNull();
  });
});

describe("parseWebsiteHtml", () => {
  it("collects title, site, description, author, year, tags and image", () => {
    const html = `<head><title>Fallback</title>
      <meta property="og:title" content="Great &amp; Good Post">
      <meta property="og:site_name" content="Example Blog">
      <meta property="og:description" content="It&#39;s a post.">
      <meta name="author" content="Pat">
      <meta property="article:published_time" content="2024-03-02T10:00:00Z">
      <meta name="keywords" content="a, b ,, c">
      <meta property="og:image" content="/img/x.jpg"></head>`;
    expect(parseWebsiteHtml(html, page)).toEqual({
      title: "Great & Good Post", site_name: "Example Blog", creator: "Pat", year: 2024,
      notes: "It's a post.", tags: "a, b, c", ogImage: "/img/x.jpg",
    });
  });
  it("falls back to the <title> and the host name", () => {
    expect(parseWebsiteHtml("<title> Plain page </title>", page)).toMatchObject({ title: "Plain page", site_name: "example.com", creator: null, year: null, ogImage: null });
    expect(parseWebsiteHtml("", page).title).toBe("www.example.com");
  });
});
