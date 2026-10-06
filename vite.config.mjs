import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  base: "./",
  root: ".",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    // Some tests build whole databases and take a few seconds on a busy or slow computer (GitHub's runners
    // hit the default 5 seconds in the first CI run). A generous limit costs nothing when they are quick.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
