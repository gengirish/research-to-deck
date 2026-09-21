import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Playwright owns tests/e2e; vitest must not try to load its specs.
    exclude: ["tests/e2e/**", "node_modules/**"],
    environment: "node",
  },
});
