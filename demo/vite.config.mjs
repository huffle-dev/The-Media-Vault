import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));

// In the app a cover is shown from `file://<path on disk>`. In the demo a cover is a drawn picture
// (a data: address), so for this build only, that prefix is made to come out empty. The real build never
// sees this plugin.
const demoArtAddresses = {
  name: "demo-art-addresses",
  enforce: "pre",
  transform(code, id) {
    if (!/\.(jsx?|mjs)$/.test(id) || id.includes("node_modules") || !code.includes("file://${")) return null;
    return { code: code.replaceAll("`file://${", "`${"), map: null };
  },
};

// The shared "core" modules are written for both Node and the web, and several are CommonJS. The build
// handles that, but the local dev server serves them raw and fails on named imports ("doesn't provide an
// export named …"). Listing every core module the app imports makes the dev server convert them first.
function coreImports() {
  const root = path.resolve(here, "..");
  const found = new Set();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", "dist", "release", "mobile", "docs", "test", "e2e", "demo", "packages"].includes(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(jsx?|mjs)$/.test(e.name)) {
        for (const m of fs.readFileSync(full, "utf8").matchAll(/from\s+["'](@media-vault\/core\/[^"']+)["']/g)) found.add(m[1]);
      }
    }
  };
  walk(root);
  return [...found];
}

export default defineConfig({
  optimizeDeps: { include: coreImports() },
  root: here,
  base: "./",
  plugins: [demoArtAddresses, react()],
  server: { fs: { allow: [path.resolve(here, "..")] } },
  build: { outDir: path.resolve(here, "../docs/demo"), emptyOutDir: true },
});
