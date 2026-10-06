import { defineConfig } from "vitest/config";

// End-to-end tests drive the REAL app (a built dist/ in a real Electron window,
// with its own throwaway data folder). Run with `npm run test:e2e`; they are
// kept out of `npm test` because they open windows and take a while.
export default defineConfig({
  test: {
    include: ["e2e/**/*.e2e.js"],
    environment: "node",
    testTimeout: 90_000,
    hookTimeout: 90_000,
    fileParallelism: false,
  },
});
