// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import Description from "../../components/Description.jsx";

afterEach(cleanup);

describe("Description", () => {
  it("shows short text in full with no toggle", () => {
    render(<Description text="A short blurb." />);
    expect(screen.getByText("A short blurb.")).toBeInTheDocument();
    expect(screen.queryByText("Show more")).toBeNull();
  });
  it("collapses long text behind Show more, and Show less puts it back", async () => {
    const long = "word ".repeat(200);
    render(<Description text={long} />);
    const body = screen.getByText(/^word word/);
    expect(body.style.overflow).toBe("hidden");
    await userEvent.click(screen.getByText("Show more"));
    expect(screen.getByText("Show less")).toBeInTheDocument();
    expect(body.style.overflow).not.toBe("hidden");
    await userEvent.click(screen.getByText("Show less"));
    expect(screen.getByText("Show more")).toBeInTheDocument();
    expect(body.style.overflow).toBe("hidden");
  });
  it("treats many short lines as long too (a wall of links)", () => {
    render(<Description text={Array.from({ length: 12 }, (_, i) => `https://example.com/${i}`).join("\n")} />);
    expect(screen.getByText("Show more")).toBeInTheDocument();
  });
  it("keeps line breaks and wraps long links", () => {
    render(<Description text={"line one\nline two"} />);
    const body = screen.getByText(/line one/);
    expect(body.style.whiteSpace).toBe("pre-line");
    expect(body.style.overflowWrap).toBe("anywhere");
  });
});
