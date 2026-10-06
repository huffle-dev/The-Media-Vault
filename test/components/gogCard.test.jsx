// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import GogCard, { GOG_WARNING } from "../../settings/GogCard.jsx";

afterEach(cleanup);

const LoginRow = ({ connected, onLogin, label }) => <button onClick={onLogin}>{connected ? "connected" : label}</button>;
const hook = (over = {}) => ({
  gogEnabled: false, gogConnected: false, gogLoggingIn: false, gogResult: null,
  handleGogLogin: vi.fn(), handleGogDisconnect: vi.fn(), handleGogEnabledChange: vi.fn(),
  ...over,
});

describe("GogCard (GOG import is unofficial and off by default)", () => {
  it("starts switched off, with the warning in plain words and no way to sign in", () => {
    render(<GogCard gog={hook()} LoginRow={LoginRow} />);
    expect(screen.getByText("GOG (unofficial)")).toBeInTheDocument();
    for (const line of GOG_WARNING) expect(screen.getByText(line)).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(/could stop working/);
    expect(screen.queryByRole("button", { name: "↗ Log in with GOG" })).toBeNull();
  });

  it("will not turn on until the person says they understand", async () => {
    const gog = hook();
    render(<GogCard gog={gog} LoginRow={LoginRow} />);
    const turnOn = screen.getByRole("button", { name: "Turn on GOG import" });
    expect(turnOn).toBeDisabled();
    await userEvent.click(turnOn);
    expect(gog.handleGogEnabledChange).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("checkbox", { name: /I understand/ }));
    expect(turnOn).toBeEnabled();
    await userEvent.click(turnOn);
    expect(gog.handleGogEnabledChange).toHaveBeenCalledWith(true);
  });

  it("once on, shows the sign-in and a way to turn it off again", async () => {
    const gog = hook({ gogEnabled: true });
    render(<GogCard gog={gog} LoginRow={LoginRow} />);
    await userEvent.click(screen.getByRole("button", { name: "↗ Log in with GOG" }));
    expect(gog.handleGogLogin).toHaveBeenCalled();
    expect(screen.queryByRole("checkbox")).toBeNull();
    await userEvent.click(screen.getByText(/Turn off GOG import/));
    expect(gog.handleGogEnabledChange).toHaveBeenCalledWith(false);
  });
});
