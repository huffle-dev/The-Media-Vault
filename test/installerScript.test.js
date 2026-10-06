import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// The installer pages can't be clicked through in a test, so these guard the parts that would hurt if
// they were lost: the uninstaller must never delete the person's data during an update or a silent run,
// must default to keeping it, and must only touch the app's own data folders.
const root = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const nsh = fs.readFileSync(path.join(root, "build", "installer.nsh"), "utf8");

describe("Windows installer script", () => {
  it("lets the script, not electron-builder, decide about the desktop shortcut", () => {
    expect(pkg.build.nsis.createDesktopShortcut).toBe(false);
    expect(nsh).toMatch(/CreateShortCut "\$DESKTOP\\The Media Vault\.lnk"/);
  });
  it("keeps user data by default on uninstall (No is the default button)", () => {
    expect(pkg.build.nsis.deleteAppDataOnUninstall).toBe(false);
    expect(nsh).toMatch(/MB_YESNO\|MB_ICONEXCLAMATION\|MB_DEFBUTTON2/);
  });
  it("never asks or deletes during an update or a silent uninstall", () => {
    const un = nsh.slice(nsh.indexOf("!macro customUnInstall"));
    expect(un).toMatch(/\$\{ifNot\} \$\{isUpdated\}/);
    expect(un).toMatch(/\$\{IfNot\} \$\{Silent\}/);
    expect(un.indexOf("Call un.MVWipeUserData")).toBeGreaterThan(un.indexOf("MessageBox"));
  });
  it("only wipes the app's own data folders", () => {
    const dirs = [...nsh.matchAll(/RMDir \/r "([^"]+)"/g)].map((m) => m[1]);
    expect(dirs.length).toBeGreaterThan(0);
    for (const d of dirs) expect(d).toMatch(/^\$(APPDATA|LOCALAPPDATA)\\the-vault(-updater)?$/);
    expect(pkg.name).toBe("the-vault"); // the folder name above is derived from this
  });
});
