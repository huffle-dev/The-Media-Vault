// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import AboutModal from "../../modals/AboutModal.jsx";

beforeEach(() => {
  window.vault = {
    app: {
      getInfo: vi.fn().mockResolvedValue({ version: "1.2.3", dataPath: "C:\\Users\\x\\AppData\\Roaming\\the-vault" }),
      openLicences: vi.fn(),
      openPrivacy: vi.fn(),
    },
    shell: { openExternal: vi.fn() },
  };
});
afterEach(() => { cleanup(); delete window.vault; });

describe("AboutModal", () => {
  it("shows the version and where the library lives", async () => {
    render(<AboutModal onClose={() => {}} />);
    expect(await screen.findByText("Version 1.2.3")).toBeInTheDocument();
    expect(screen.getByText(/AppData\\Roaming\\the-vault/)).toBeInTheDocument();
  });

  it("carries the wording each data provider requires", async () => {
    render(<AboutModal onClose={() => {}} />);
    expect(await screen.findByText(/not endorsed or certified by TMDB/)).toBeInTheDocument();
    expect(screen.getByText(/YouTube API Services/)).toBeInTheDocument();
    expect(screen.getByText(/Valve Corporation/)).toBeInTheDocument();
  });

  it("shows TMDB's own logo with its statement, and marks GOG as optional and unofficial", async () => {
    render(<AboutModal onClose={() => {}} />);
    const logo = await screen.findByAltText("TMDB");
    expect(logo).toBeInTheDocument();
    await userEvent.click(logo);
    expect(window.vault.shell.openExternal).toHaveBeenCalledWith("https://www.themoviedb.org");
    expect(screen.getByText(/Optional, unofficial GOG library import/)).toBeInTheDocument();
  });

  it("opens provider links through the app, not in the window itself", async () => {
    render(<AboutModal onClose={() => {}} />);
    await userEvent.click(await screen.findByText("TMDB"));
    expect(window.vault.shell.openExternal).toHaveBeenCalledWith("https://www.themoviedb.org");
    await userEvent.click(screen.getByText("YouTube Terms of Service"));
    expect(window.vault.shell.openExternal).toHaveBeenLastCalledWith("https://www.youtube.com/t/terms");
  });

  it("opens the licences and the privacy notice", async () => {
    render(<AboutModal onClose={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: "Open-source licences" }));
    expect(window.vault.app.openLicences).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Privacy notice" }));
    expect(window.vault.app.openPrivacy).toHaveBeenCalled();
  });

  it("closes from the button, from Escape and from clicking outside, but not from clicking inside", async () => {
    const onClose = vi.fn();
    render(<AboutModal onClose={onClose} />);
    await screen.findByText("Version 1.2.3");
    await userEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole("dialog").parentElement);
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
