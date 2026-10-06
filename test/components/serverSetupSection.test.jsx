// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import ServerSetupSection from "../../settings/ServerSetupSection.jsx";

// The renderer only ever talks to the main process through window.vault.
function mockVault(config) {
  const cloudSync = {
    getConfig: vi.fn().mockResolvedValue(config),
    testConfig: vi.fn().mockResolvedValue({ ok: true, message: "Connected to abcd.supabase.co — the database is set up." }),
    setConfig: vi.fn().mockResolvedValue({ url: "https://abcd.supabase.co", host: "abcd.supabase.co", changed: true }),
    copySetupSql: vi.fn().mockResolvedValue(true),
  };
  const shell = { openExternal: vi.fn() };
  window.vault = { cloudSync, shell };
  return { cloudSync, shell };
}
const configured = { configured: true, url: "https://abcd.supabase.co", host: "abcd.supabase.co", keyHint: "k8K1" };

beforeEach(() => { delete window.vault; });
afterEach(cleanup);

describe("ServerSetupSection: a server is already saved", () => {
  it("shows which server and the three actions, but not the setup form", async () => {
    mockVault(configured);
    render(<ServerSetupSection />);
    expect(await screen.findByText(/abcd\.supabase\.co/)).toBeInTheDocument();
    expect(screen.getByText(/key …k8K1/)).toBeInTheDocument();
    for (const name of ["Change server", "Copy setup SQL", "Open SQL Editor ↗"]) expect(screen.getByRole("button", { name })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/supabase\.co/)).toBeNull();
  });

  it("Copy setup SQL asks the main process to do the copying and confirms", async () => {
    const { cloudSync } = mockVault(configured);
    render(<ServerSetupSection />);
    await userEvent.click(await screen.findByRole("button", { name: "Copy setup SQL" }));
    expect(cloudSync.copySetupSql).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "✓ Copied" })).toBeInTheDocument();
  });

  it("explains a copy that fails instead of failing silently", async () => {
    const { cloudSync } = mockVault(configured);
    cloudSync.copySetupSql.mockRejectedValue(new Error("Clipboard blocked"));
    render(<ServerSetupSection />);
    await userEvent.click(await screen.findByRole("button", { name: "Copy setup SQL" }));
    expect(await screen.findByText(/Couldn't copy the setup SQL/)).toBeInTheDocument();
  });

  it("Open SQL Editor opens the Supabase dashboard", async () => {
    const { shell } = mockVault(configured);
    render(<ServerSetupSection />);
    await userEvent.click(await screen.findByRole("button", { name: "Open SQL Editor ↗" }));
    expect(shell.openExternal).toHaveBeenCalledWith(expect.stringContaining("supabase.com/dashboard"));
  });

  it("Change server opens the form with a sign-out warning, and Cancel puts it away", async () => {
    mockVault(configured);
    render(<ServerSetupSection />);
    await userEvent.click(await screen.findByRole("button", { name: "Change server" }));
    expect(screen.getByPlaceholderText(/https:\/\/abcdefgh\.supabase\.co/)).toBeInTheDocument();
    expect(screen.getByText(/signs you out of the current one/)).toBeInTheDocument();
    await userEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByPlaceholderText(/https:\/\/abcdefgh/)).toBeNull();
  });
});

describe("ServerSetupSection: no server yet", () => {
  const fill = async () => {
    await userEvent.type(await screen.findByPlaceholderText(/https:\/\/abcdefgh\.supabase\.co/), "abcd.supabase.co");
    await userEvent.type(screen.getByPlaceholderText(/sb_publishable_/), "sb_publishable_abc");
  };

  it("walks through the three steps and starts with Test and Save disabled", async () => {
    mockVault({ configured: false });
    render(<ServerSetupSection />);
    expect(await screen.findByText(/Create a free project/)).toBeInTheDocument();
    expect(screen.getByText(/SQL Editor/)).toBeInTheDocument();
    expect(screen.getByText(/publishable/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test connection" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("tests what was typed and shows the verdict, green when it works", async () => {
    const { cloudSync } = mockVault({ configured: false });
    render(<ServerSetupSection />);
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect(cloudSync.testConfig).toHaveBeenCalledWith("abcd.supabase.co", "sb_publishable_abc");
    expect(await screen.findByText(/the database is set up/)).toBeInTheDocument();
  });

  it("shows a failed test in the red, with the reason", async () => {
    const { cloudSync } = mockVault({ configured: false });
    cloudSync.testConfig.mockResolvedValue({ ok: false, stage: "schema", message: "Connected, but the database is empty. Run the setup SQL." });
    render(<ServerSetupSection />);
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect(await screen.findByText(/database is empty/)).toBeInTheDocument();
  });

  it("saving reports a changed server to the parent and shows the saved one", async () => {
    const { cloudSync } = mockVault({ configured: false });
    const onServerChanged = vi.fn();
    render(<ServerSetupSection onServerChanged={onServerChanged} />);
    await fill();
    cloudSync.getConfig.mockResolvedValue(configured); // what it reads back after saving
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(cloudSync.setConfig).toHaveBeenCalledWith("abcd.supabase.co", "sb_publishable_abc"));
    expect(onServerChanged).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "Change server" })).toBeInTheDocument();
  });

  it("a save the server refuses (say, the secret key) shows the reason and keeps the form", async () => {
    const { cloudSync } = mockVault({ configured: false });
    cloudSync.setConfig.mockRejectedValue(new Error("That is a SECRET key. Use the publishable key."));
    render(<ServerSetupSection />);
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/SECRET key/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/sb_publishable_/)).toBeInTheDocument();
  });
});
