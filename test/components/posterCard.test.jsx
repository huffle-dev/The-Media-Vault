// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import PosterCard, { StatusWheel } from "../../components/PosterCard.jsx";

// jsdom has no layout engine or ResizeObserver; PosterCard measures its hover buttons.
beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(cleanup);

const rect = (left, top, width = 80, height = 24) => ({ left, top, width, height, right: left + width, bottom: top + height });
const STATUS_LABELS = ["Wishlist", "Not Started", "In Progress", "Consumed", "Dropped"];

describe("StatusWheel", () => {
  it("offers every status, with the current one ringed thicker than the rest", () => {
    render(<StatusWheel current="in-progress" anchorRect={rect(500, 350)} tileRect={rect(480, 300, 120, 180)} onSelect={() => {}} onClose={() => {}} />);
    for (const label of STATUS_LABELS) expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "In Progress" }).style.border).toMatch(/^2px/);
    expect(screen.getByRole("button", { name: "Wishlist" }).style.border).toMatch(/^1px/);
  });

  it("picking one reports it and closes", async () => {
    const onSelect = vi.fn(), onClose = vi.fn();
    render(<StatusWheel current="wishlist" anchorRect={rect(500, 350)} tileRect={rect(480, 300, 120, 180)} onSelect={onSelect} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Dropped" }));
    expect(onSelect).toHaveBeenCalledWith("dropped");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape and when you click outside it", async () => {
    const onClose = vi.fn();
    const { container } = render(<StatusWheel current="wishlist" anchorRect={rect(500, 350)} onSelect={() => {}} onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(document.body.firstElementChild.nextElementSibling ? document.body.querySelector("div[style*='inset']") : container);
    expect(onClose.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("fans out in a circle in the open, but becomes one tidy column against a window edge", () => {
    const { unmount } = render(<StatusWheel current="wishlist" anchorRect={rect(500, 350)} onSelect={() => {}} onClose={() => {}} />);
    const lefts = STATUS_LABELS.map((l) => screen.getByRole("button", { name: l }).style.left);
    expect(new Set(lefts).size).toBeGreaterThan(1); // spread around the trigger
    unmount();
    render(<StatusWheel current="wishlist" anchorRect={rect(0, 0)} tileRect={rect(0, 0, 100, 150)} onSelect={() => {}} onClose={() => {}} />);
    const edgeLefts = STATUS_LABELS.map((l) => screen.getByRole("button", { name: l }).style.left);
    expect(new Set(edgeLefts).size).toBe(1); // a straight column
  });
});

describe("StatusWheel near, but not on, a window edge", () => {
  it("keeps the circle for the second column of a narrow window, and uses the column only for the edge tile", () => {
    window.innerWidth = 460; window.innerHeight = 700;
    const { unmount } = render(<StatusWheel current="wishlist" anchorRect={rect(100, 300, 40, 20)} tileRect={rect(92, 250, 90, 135)} onSelect={() => {}} onClose={() => {}} />);
    const lefts = STATUS_LABELS.map((l) => parseFloat(screen.getByRole("button", { name: l }).style.left));
    expect(new Set(lefts).size).toBeGreaterThan(1); // still a circle
    expect(Math.min(...lefts)).toBeGreaterThanOrEqual(0); // and fully on screen
    unmount();
    render(<StatusWheel current="wishlist" anchorRect={rect(0, 300, 40, 20)} tileRect={rect(0, 250, 90, 135)} onSelect={() => {}} onClose={() => {}} />);
    const edge = STATUS_LABELS.map((l) => screen.getByRole("button", { name: l }).style.left);
    expect(new Set(edge).size).toBe(1);
  });
});

describe("PosterCard status changes", () => {
  const item = (over = {}) => ({ id: 7, title: "Dune", media_type: "Movie", status: "wishlist", rating: null, date_consumed: null, ...over });
  const setup = async (over, props = {}) => {
    const onQuickSave = vi.fn().mockResolvedValue(undefined);
    const utils = render(<PosterCard item={item(over)} onView={() => {}} onDeleteRequest={() => {}} onQuickSave={onQuickSave} {...props} />);
    const card = screen.getByText("Dune").closest("div[style*='cursor: pointer']") || utils.container.firstElementChild;
    await userEvent.hover(card);
    return { onQuickSave, utils };
  };

  it("shows the current status on hover and opens the picker from it", async () => {
    await setup();
    const statusBtn = screen.getByRole("button", { name: "Wishlist" });
    await userEvent.click(statusBtn);
    expect(screen.getAllByRole("button", { name: "Consumed" }).length).toBeGreaterThan(0);
  });

  it("marking something Consumed saves the status and stamps today as the date", async () => {
    const { onQuickSave } = await setup({ status: "in-progress" });
    await userEvent.click(screen.getByRole("button", { name: "In Progress" }));
    await userEvent.click(screen.getAllByRole("button", { name: "Consumed" }).at(-1));
    expect(onQuickSave).toHaveBeenCalledTimes(1);
    const [id, patch] = onQuickSave.mock.calls[0];
    expect(id).toBe(7);
    expect(patch.status).toBe("consumed");
    expect(patch.date_consumed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("moving a rated item back to Wishlist clears its rating", async () => {
    const { onQuickSave } = await setup({ status: "consumed", rating: 15, date_consumed: "2026-01-01" });
    await userEvent.click(screen.getByRole("button", { name: "Consumed" }));
    await userEvent.click(screen.getAllByRole("button", { name: "Wishlist" }).at(-1));
    expect(onQuickSave).toHaveBeenCalledWith(7, expect.objectContaining({ status: "wishlist", rating: null }));
  });

  it("keeps what it saved on screen even before the parent catches up", async () => {
    const { utils } = await setup({ status: "wishlist" });
    await userEvent.click(screen.getByRole("button", { name: "Wishlist" }));
    await userEvent.click(screen.getAllByRole("button", { name: "Dropped" }).at(-1));
    expect(within(utils.container).getByRole("button", { name: "Dropped" })).toBeInTheDocument();
  });
});
