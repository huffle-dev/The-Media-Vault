// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import PhoneLogSection from "../../settings/PhoneLogSection.jsx";

beforeEach(() => {
  window.vault = { cloudSync: {
    getPhoneLog: vi.fn(), copyPhoneLog: vi.fn().mockResolvedValue(true), showPhoneLogFile: vi.fn().mockResolvedValue(true),
  } };
});
afterEach(() => { cleanup(); delete window.vault; });

describe("PhoneLogSection (the phone's log on the desktop)", () => {
  it("explains where the log comes from and shows nothing until asked", () => {
    render(<PhoneLogSection />);
    expect(screen.getByText(/Send log to my computer/)).toBeInTheDocument();
    expect(screen.queryByLabelText("The phone's log")).toBeNull();
  });
  it("shows the log the phone sent, and can copy it or open its file", async () => {
    window.vault.cloudSync.getPhoneLog.mockResolvedValue({ found: true, text: "Phone log sent T\n\n[ERROR] boom", file: "C:/x/phone-log.txt" });
    render(<PhoneLogSection />);
    await userEvent.click(screen.getByRole("button", { name: "Show the phone's log" }));
    expect(await screen.findByLabelText("The phone's log")).toHaveValue("Phone log sent T\n\n[ERROR] boom");
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(window.vault.cloudSync.copyPhoneLog).toHaveBeenCalled());
    expect(await screen.findByText("✓ Copied")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show the file" }));
    expect(window.vault.cloudSync.showPhoneLogFile).toHaveBeenCalled();
  });
  it("says so when the phone hasn't sent one, and when the fetch fails", async () => {
    window.vault.cloudSync.getPhoneLog.mockResolvedValueOnce({ found: false });
    render(<PhoneLogSection />);
    await userEvent.click(screen.getByRole("button", { name: "Show the phone's log" }));
    expect(await screen.findByText(/hasn't sent a log yet/)).toBeInTheDocument();
    window.vault.cloudSync.getPhoneLog.mockRejectedValueOnce(new Error("Cloud Sync session expired"));
    await userEvent.click(screen.getByRole("button", { name: "Show the phone's log" }));
    expect(await screen.findByText(/session expired/)).toBeInTheDocument();
  });
});
