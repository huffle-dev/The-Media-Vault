// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import AutoSyncModePicker from "../../settings/AutoSyncModePicker.jsx";

afterEach(cleanup);

describe("AutoSyncModePicker", () => {
  it("shows the three choices with the current one selected", () => {
    render(<AutoSyncModePicker mode="launch" onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: /^Off/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /^When the app opens/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /^Automatic/ })).not.toBeChecked();
  });
  it("explains each choice", () => {
    render(<AutoSyncModePicker mode="off" onChange={() => {}} />);
    expect(screen.getByText(/Only when you click Sync Now/)).toBeInTheDocument();
    expect(screen.getByText(/About a minute after you edit/)).toBeInTheDocument();
  });
  it("reports the choice made", async () => {
    const onChange = vi.fn();
    render(<AutoSyncModePicker mode="off" onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: /^Automatic/ }));
    expect(onChange).toHaveBeenCalledWith("auto");
    await userEvent.click(screen.getByRole("radio", { name: /^When the app opens/ }));
    expect(onChange).toHaveBeenLastCalledWith("launch");
  });
  it("keeps two pickers on one screen independent (separate radio group names)", () => {
    render(<><AutoSyncModePicker mode="off" onChange={() => {}} name="a" /><AutoSyncModePicker mode="auto" onChange={() => {}} name="b" /></>);
    expect(screen.getAllByRole("radio", { checked: true })).toHaveLength(2);
  });
});
