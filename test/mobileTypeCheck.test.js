import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import path from "path";

// The phone's screens are not rendered by any test, so a slip like calling something that is not a function, or
// using a name that was never defined, would only show up on a phone (a release build closes on it, and the saved
// sign-in brings it straight back). This runs TypeScript's checker over the phone's code, with type mismatches
// ignored, and fails on the mistakes that crash at run time. mobile/tsconfig.check.json holds the settings.
// (A phone-only version of this run is `npx tsc -p mobile/tsconfig.check.json`.)
const BLOCKING = {
  TS2349: "calls something that is not a function",
  TS2304: "uses a name that is not defined",
  TS2552: "uses a name that is not defined",
  TS2305: "imports something that the module does not export",
  TS2724: "imports something that the module does not export",
  TS2614: "imports something that the module does not export",
  TS2459: "imports something that the module does not export",
  TS2551: "uses a property that does not exist (misspelt?)",
  TS2448: "uses a variable before it is declared",
  TS2451: "declares the same name twice",
  TS2300: "declares the same name twice",
  TS2693: "uses a type where a value is needed",
};

describe("the phone's code type-checks for run-time mistakes", () => {
  it("has none of the mistakes that close the app", () => {
    const root = path.join(__dirname, "..");
    const tsc = path.join(root, "node_modules", "typescript", "bin", "tsc");
    const run = spawnSync(process.execPath, [tsc, "-p", path.join("mobile", "tsconfig.check.json")], {
      cwd: root, encoding: "utf8", env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, maxBuffer: 50 * 1024 * 1024,
    });
    const lines = `${run.stdout || ""}${run.stderr || ""}`.split("\n");
    const problems = lines
      .map((l) => /^(.*?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(l))
      .filter((m) => m && BLOCKING[m[4]])
      .map((m) => `${m[1]}:${m[2]}  ${BLOCKING[m[4]]} — ${m[5]}`);
    expect(problems).toEqual([]);
  }, 120_000);
});
