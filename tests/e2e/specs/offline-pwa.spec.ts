import { expect, test } from "../fixtures/test";

/**
 * The app installs as a PWA and has an opinion about being offline, because a run
 * needs the network for OpenAlex and Claude. These specs cover what the person
 * sees when the connection goes — not the service worker's caching strategy,
 * which browsers are free to schedule differently between runs.
 */
test.describe("Offline behaviour", () => {
  test("warns that generation is paused when the connection drops", async ({ context, entryPage, page }) => {
    await entryPage.goto();
    await expect(page.locator(".pwa-bar")).toHaveCount(0);

    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));

    const bar = page.locator(".pwa-bar");
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute("role", "status");
    await expect(bar).toContainText("Offline — deck generation is paused");

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(bar).toHaveCount(0);
  });

  test("the offline fallback explains what still works", async ({ page }) => {
    await page.goto("/offline");

    await expect(page.getByRole("heading", { name: /You.re offline/ })).toBeVisible();
    await expect(page.getByText(/already finished is still downloadable/)).toBeVisible();
  });

  test("declares itself installable", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#f2f2f3");
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  });
});
