// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ArtImage from "../../components/ArtImage.jsx";

afterEach(cleanup);

describe("ArtImage", () => {
  it("fills the frame with one picture for ordinary art", () => {
    const { container } = render(<ArtImage src="file://a.jpg" alt="Poster" />);
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toHaveAttribute("src", "file://a.jpg");
    expect(imgs[0].style.objectFit).toBe("cover");
  });
  it("shows wide (16:9) art whole over a blurred copy of itself", () => {
    const { container } = render(<ArtImage src="file://t.jpg" alt="Video" wide />);
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(2);
    const [backdrop, sharp] = imgs;
    expect(backdrop).toHaveAttribute("aria-hidden", "true");
    expect(backdrop.style.filter).toContain("blur");
    expect(sharp).toHaveAttribute("alt", "Video");
    expect(sharp.style.aspectRatio).toMatch(/16\s*\/\s*9/);
  });
});
