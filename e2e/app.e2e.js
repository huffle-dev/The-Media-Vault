import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeDataDir, removeDataDir, launchApp, dismissWelcome, menuAction } from "./helpers.js";

// A small suite on purpose: each test drives the real built app through a whole
// path the unit and component tests can't reach — the window, the preload
// bridge, the database and the screens working together.
const dataDir = makeDataDir();
afterAll(() => removeDataDir(dataDir));

describe("the real app", () => {
  let running;
  beforeAll(async () => { running = await launchApp(dataDir); });
  afterAll(async () => { await running?.app.close(); });

  it("opens on a fresh data folder, shows the Welcome screen once, then the empty library", async () => {
    const { page, errors } = running;
    await page.getByText("Welcome to The Media Vault").waitFor({ timeout: 20_000 });
    await dismissWelcome(page);
    await page.getByRole("button", { name: "+Add" }).waitFor();
    expect(await page.title()).toContain("Media Vault");
    expect(errors).toEqual([]);
  });

  it("Settings → Cloud Sync asks a new install for its own server, and checks what you type", async () => {
    const { app, page } = running;
    await menuAction(app, "settings", "Cloud Sync");
    // No server is built in any more: a fresh install starts at the setup steps.
    await page.getByText("Create a free project").waitFor();
    await page.getByRole("button", { name: "Copy setup SQL" }).waitFor();
    expect(await page.getByRole("button", { name: "Test connection" }).isDisabled()).toBe(true);
    // A nonsense address is turned down on the spot, with a reason (no network involved).
    await page.getByPlaceholder("https://abcdefgh.supabase.co").fill("nope");
    await page.getByPlaceholder("sb_publishable_…").fill("sb_publishable_abc");
    await page.getByRole("button", { name: "Test connection" }).click();
    await page.getByText(/doesn't look like/).waitFor();
    // The secret key is refused outright.
    await page.getByPlaceholder("https://abcdefgh.supabase.co").fill("https://abcd.supabase.co");
    await page.getByPlaceholder("sb_publishable_…").fill("sb_secret_abc");
    await page.getByRole("button", { name: "Test connection" }).click();
    await page.getByText(/SECRET key/).waitFor();
    await page.getByRole("button", { name: "Close" }).click();
  });

  it("GOG import is off until switched on, behind a warning", async () => {
    const { app, page } = running;
    await menuAction(app, "settings", "API Keys & Accounts");
    await page.getByText("GOG (unofficial)").waitFor();
    await page.getByText(/could stop working/).waitFor();
    expect(await page.getByRole("button", { name: "↗ Log in with GOG" }).count()).toBe(0);
    expect(await page.getByRole("button", { name: "Turn on GOG import" }).isDisabled()).toBe(true);
    await page.getByRole("checkbox", { name: /I understand/ }).check();
    expect(await page.getByRole("button", { name: "Turn on GOG import" }).isDisabled()).toBe(false);
    await page.getByRole("button", { name: "Close" }).click();
  });

  it("Settings shows the app version beside its title", async () => {
    const { app, page } = running;
    await menuAction(app, "settings", "Appearance");
    await page.getByText("Settings", { exact: true }).first().waitFor();
    await page.getByTestId("app-version").waitFor();
    expect(await page.getByTestId("app-version").textContent()).toMatch(/^v\d+\.\d+\.\d+/);
    await page.getByText("✕").click();
  });

  it("Help → About & Credits shows the version and the provider credits", async () => {
    const { app, page } = running;
    await menuAction(app, "showAbout");
    await page.getByRole("dialog", { name: "About The Media Vault" }).waitFor();
    await page.getByText(/^Version \d/).waitFor();
    await page.getByText(/not endorsed or certified by TMDB/).waitFor();
    await page.getByAltText("TMDB").waitFor();
    await page.getByRole("button", { name: "Close" }).click();
    expect(await page.getByRole("dialog", { name: "About The Media Vault" }).count()).toBe(0);
  });

  it("adds an item through the real screens and shows it in the library", async () => {
    const { page } = running;
    await page.getByRole("button", { name: "+Add" }).click();
    await page.getByText("Add Manually").click();
    await page.getByPlaceholder("e.g. Dune: Part Two").fill("E2E Test Movie");
    await page.getByRole("button", { name: "Add to Library" }).click();
    await page.getByText("E2E Test Movie").first().waitFor({ timeout: 15_000 });
  });

  it("keeps it after the app is closed and opened again", async () => {
    await running.app.close();
    running = await launchApp(dataDir);
    const { page, errors } = running;
    await page.getByRole("button", { name: "+Add" }).waitFor({ timeout: 20_000 });
    await page.getByText("E2E Test Movie").first().waitFor({ timeout: 15_000 });
    // The Welcome screen is first-launch only.
    expect(await page.getByText("Welcome to The Media Vault").count()).toBe(0);
    expect(errors).toEqual([]);
  });
});
