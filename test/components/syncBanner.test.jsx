// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import SyncBanner from "../../components/SyncBanner.jsx";

afterEach(cleanup);

const failed = (over = {}) => ({ state: "error", mode: "auto", error: "network down", needsLogin: false, retryAt: Date.now() + 60_000, failedAt: 1, ...over });

describe("SyncBanner", () => {
  it("shows nothing before a failure, while syncing, and after a success", () => {
    for (const status of [null, { state: "idle" }, { state: "syncing", mode: "auto" }, { state: "ok", mode: "auto", at: 1 }]) {
      const { container, unmount } = render(<SyncBanner status={status} onRetry={() => {}} onOpenSettings={() => {}} />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it("stays out of the way when automatic sync is off, even after a failed manual sync", () => {
    const { container } = render(<SyncBanner status={failed({ mode: "off" })} onRetry={() => {}} onOpenSettings={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says what failed and when it will try again, with a Retry button", async () => {
    const onRetry = vi.fn();
    render(<SyncBanner status={failed()} onRetry={onRetry} onOpenSettings={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Cloud Sync isn't working.");
    expect(screen.getByRole("alert")).toHaveTextContent("network down");
    expect(screen.getByRole("alert")).toHaveTextContent(/Trying again in/);
    await userEvent.click(screen.getByRole("button", { name: "Retry now" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("offers Log in instead of Retry when the login has expired, and does not promise a retry", async () => {
    const onOpenSettings = vi.fn();
    render(<SyncBanner status={failed({ needsLogin: true, retryAt: null, error: "session expired" })} onRetry={() => {}} onOpenSettings={onOpenSettings} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Your login has expired");
    expect(screen.getByRole("alert")).not.toHaveTextContent(/Trying again/);
    expect(screen.queryByRole("button", { name: "Retry now" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("Dismiss hides it until a DIFFERENT failure happens", async () => {
    const { rerender } = render(<SyncBanner status={failed({ failedAt: 1 })} onRetry={() => {}} onOpenSettings={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).toBeNull();
    rerender(<SyncBanner status={failed({ failedAt: 1, retryAt: Date.now() + 120_000 })} onRetry={() => {}} onOpenSettings={() => {}} />);
    expect(screen.queryByRole("alert")).toBeNull(); // same failure
    rerender(<SyncBanner status={failed({ failedAt: 2 })} onRetry={() => {}} onOpenSettings={() => {}} />);
    expect(screen.getByRole("alert")).toBeInTheDocument(); // a new one
  });
});
