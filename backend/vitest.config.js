import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.js"],
    // Each test file boots its own in-memory PostgreSQL; allow for slow CI machines.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
