// Launches the real app for an end-to-end test: the built dist/ in a real
// Electron window, with its OWN throwaway data folder (--user-data-dir), so it
// never touches your library, and — because the single-instance lock is per
// data folder — it runs fine while your normal copy of the app is open.
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
import { _electron as electron } from "playwright-core";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");

export function makeDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "vault-e2e-"));
}

export function removeDataDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* still locked on Windows; the temp cleaner gets it */ }
}

// -> { app, page, errors } where `errors` collects anything the page throws.
export async function launchApp(dataDir) {
  if (!process.env.E2E_EXE && !fs.existsSync(path.join(root, "dist", "index.html"))) {
    throw new Error("dist/index.html is missing — run `npm run build-renderer` first (npm run test:e2e does it for you).");
  }
  // E2E_EXE=<path to The Media Vault.exe> runs the same tests against a PACKAGED
  // build (npm run test:e2e:packed) instead of the source tree, which proves the
  // installer's contents — the bundled native database, the asar, the icon — work.
  const packed = process.env.E2E_EXE;
  const app = await electron.launch(packed
    ? { executablePath: packed, args: [`--user-data-dir=${dataDir}`] }
    : { executablePath: require("electron"), args: [".", `--user-data-dir=${dataDir}`], cwd: root });
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.waitForLoadState("domcontentloaded");
  return { app, page, errors };
}

// A fresh data folder shows the Welcome screen once; get past it.
export async function dismissWelcome(page) {
  const getStarted = page.getByRole("button", { name: "Get started" });
  try {
    await getStarted.waitFor({ state: "visible", timeout: 15_000 });
    await getStarted.click();
  } catch { /* already dismissed */ }
}

// The app's own menu actions arrive over IPC; this is how the File/Edit menus
// reach the page, so tests can open things (Settings tabs) without OS menus.
export async function menuAction(app, action, value) {
  await app.evaluate(({ BrowserWindow }, [a, v]) => {
    BrowserWindow.getAllWindows()[0].webContents.send("menu:action", a, v);
  }, [action, value]);
}
