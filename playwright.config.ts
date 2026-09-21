import { defineConfig, devices } from "@playwright/test";

/**
 * E2E configuration.
 *
 * The suite runs against a **production build** (`next build && next start`), not
 * `next dev`: Next 16 refuses a second dev server for a directory that already has
 * one, so `next dev` would collide with whatever the developer has open, and the
 * prod server is what actually ships. Set `E2E_BASE_URL` to point the suite at an
 * already-running server (a preview deployment, or your own `next start`) and the
 * webServer block is skipped entirely.
 *
 * Clerk: the app throws without a publishable key, and a real signed-in session
 * cannot be forged, so the server gets a *synthetic* key whose frontend API host
 * (`clerk.e2e.local`) never resolves, and the browser gets a stubbed clerk-js.
 * See `tests/e2e/fixtures/clerkStub.ts` for why, and what that does and does not
 * prove. Real keys are never needed — and must not be used, since these tests
 * would then create real sessions.
 */

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

/** `pk_test_` + base64("clerk.e2e.local$") — valid in shape, unreachable in fact. */
const E2E_CLERK_PUBLISHABLE_KEY = "pk_test_Y2xlcmsuZTJlLmxvY2FsJA==";
const E2E_CLERK_SECRET_KEY = "sk_test_e2e000000000000000000000000000000000";

export default defineConfig({
  testDir: "./tests/e2e/specs",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: process.env.CI
    ? [["github"], ["html", { outputFolder: "playwright-report", open: "never" }], ["list"]]
    : [["html", { outputFolder: "playwright-report", open: "never" }], ["list"]],

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // The result view is a three-column layout that collapses under 900px; the
    // mobile project is what keeps that collapse honest.
    { name: "mobile-chrome", use: { ...devices["Pixel 5"] } },
  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next build && npx next start --port ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: E2E_CLERK_PUBLISHABLE_KEY,
          CLERK_SECRET_KEY: E2E_CLERK_SECRET_KEY,
          // The suite never reaches the pipeline, but a stray real key would make
          // a mistake expensive. Blank them so a leak fails loudly instead.
          ANTHROPIC_API_KEY: "",
          VOYAGE_API_KEY: "",
          AGENTMAIL_API_KEY: "",
          NODE_ENV: "production",
        },
      },
});
