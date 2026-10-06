// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import CloudSyncSection from "../../settings/CloudSyncSection.jsx";

const CODE = "mediavault://setup?u=https%3A%2F%2Fabcdefghijkl.supabase.co&k=sb_publishable_abcdefghijklmnop";

beforeEach(() => {
  window.vault = {
    cloudSync: {
      getConfig: vi.fn().mockResolvedValue({ configured: true, host: "abcdefghijkl.supabase.co", url: "https://abcdefghijkl.supabase.co", keyHint: "mnop" }),
      getSetupCode: vi.fn().mockResolvedValue(CODE),
      copySetupCode: vi.fn().mockResolvedValue(true),
      secretsStatus: vi.fn().mockResolvedValue({ setUp: false, unlockedLocally: false }),
    },
    shell: { openExternal: vi.fn() },
  };
});
afterEach(() => { cleanup(); delete window.vault; });

const account = (over = {}) => ({
  cloudSyncConnected: false, serverConfigured: true, cloudSyncLoggingIn: false, cloudSyncResult: null,
  handleCloudSyncLogin: vi.fn(), handleCloudSyncSignUp: vi.fn(), handleServerChanged: vi.fn(), ...over,
});

describe("Cloud Sync sign-in: create an account on your server", () => {
  it("starts as a sign-in, and switches to creating an account with a confirm box", async () => {
    render(<CloudSyncSection cloudSync={account()} />);
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByText("Confirm password")).toBeNull();
    await userEvent.click(screen.getByText("New here? Create an account"));
    expect(screen.getByText("Confirm password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
    await userEvent.click(screen.getByText("I already have an account"));
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("sends the email, password and confirmation when creating", async () => {
    const cloudSync = account();
    render(<CloudSyncSection cloudSync={cloudSync} />);
    await userEvent.click(await screen.findByText("New here? Create an account"));
    await userEvent.type(screen.getByPlaceholderText("you@example.com"), "me@example.com");
    await userEvent.type(screen.getByPlaceholderText(/Choose a password/), "long-enough-1");
    await userEvent.type(screen.getByPlaceholderText("Type it again…"), "long-enough-1");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(cloudSync.handleCloudSyncSignUp).toHaveBeenCalledWith({ email: "me@example.com", password: "long-enough-1", confirm: "long-enough-1" });
    expect(cloudSync.handleCloudSyncLogin).not.toHaveBeenCalled();
  });

  it("shows the server's answer (confirm your email) and the closing tip once signed in", async () => {
    const { rerender } = render(<CloudSyncSection cloudSync={account({ cloudSyncResult: { summary: "Account created. Check your email for a confirmation link, open it, then come back and sign in." } })} />);
    expect(await screen.findByText(/Check your email for a confirmation link/)).toBeInTheDocument();
    rerender(<CloudSyncSection cloudSync={account({ cloudSyncConnected: true, cloudSyncEmail: "me@example.com", cloudSyncResult: { tip: "Tip: turn off new sign-ups in your Supabase dashboard" } })} />);
    expect(await screen.findByText(/turn off new sign-ups/)).toBeInTheDocument();
  });
});

describe("Set up my phone", () => {
  it("shows a QR code for the setup code, and can copy the code instead", async () => {
    render(<CloudSyncSection cloudSync={account()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Set up my phone" }));
    expect(await screen.findByRole("img", { name: "Setup code for the phone app" })).toBeInTheDocument();
    expect(window.vault.cloudSync.getSetupCode).toHaveBeenCalled();
    expect(screen.getByText(/Scan setup code/)).toBeInTheDocument();
    await userEvent.click(screen.getByText("Copy the code"));
    await waitFor(() => expect(window.vault.cloudSync.copySetupCode).toHaveBeenCalled());
    expect(await screen.findByText("✓ Copied")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Hide phone code" }));
    expect(screen.queryByRole("img", { name: "Setup code for the phone app" })).toBeNull();
  });
  it("says why when the code can't be made", async () => {
    window.vault.cloudSync.getSetupCode.mockRejectedValue(new Error("Set up your server first."));
    render(<CloudSyncSection cloudSync={account()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Set up my phone" }));
    expect(await screen.findByText(/Set up your server first/)).toBeInTheDocument();
  });
});
