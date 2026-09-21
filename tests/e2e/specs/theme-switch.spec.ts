import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";

/**
 * Light / System / Dark.
 *
 * "System" is the absence of a choice: nothing stored, no data-theme on <html>, and
 * the prefers-color-scheme media query decides. Light and Dark are explicit, persist
 * across reloads, and override the OS. These are the six cells worth pinning:
 * {light OS, dark OS} x {System, Light, Dark}.
 */

const LIGHT = "rgb(242, 242, 243)";
const DARK = "rgb(20, 25, 30)";

const ground = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const themeAttr = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme ?? null);
const stored = (page: Page) => page.evaluate(() => localStorage.getItem("theme"));

/** Click the visible cell, as a person does — the radio inside it is visually hidden. */
const choose = (page: Page, name: "Light" | "System" | "Dark") =>
  page.locator(`label.seg-icon[title="${name}"]`).click();

test.describe("Theme switch", () => {
  test("is a labelled radio group of three, each a 44px target", async ({ entryPage }) => {
    await entryPage.goto();
    const group = entryPage.page.getByRole("group", { name: "Theme" });
    await expect(group).toBeVisible();
    await expect(group.getByRole("radio")).toHaveCount(3);
    for (const name of ["Light", "System", "Dark"]) {
      await expect(group.getByRole("radio", { name })).toHaveCount(1);
    }
    for (const box of await entryPage.page.locator(".seg-icon").evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect()),
    )) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("defaults to System, storing nothing", async ({ entryPage }) => {
    await entryPage.goto();
    await expect(entryPage.page.getByRole("radio", { name: "System" })).toBeChecked();
    expect(await themeAttr(entryPage.page)).toBeNull();
    expect(await stored(entryPage.page)).toBeNull();
  });

  for (const os of ["light", "dark"] as const) {
    test.describe(`on a ${os} OS`, () => {
      test.use({ colorScheme: os });

      test("System follows the OS", async ({ entryPage }) => {
        await entryPage.goto();
        expect(await ground(entryPage.page)).toBe(os === "dark" ? DARK : LIGHT);
      });

      test("Dark forces dark", async ({ entryPage }) => {
        await entryPage.goto();
        await choose(entryPage.page, "Dark");
        expect(await themeAttr(entryPage.page)).toBe("dark");
        expect(await ground(entryPage.page)).toBe(DARK);
      });

      test("Light forces light, including the UA's own controls", async ({ entryPage }) => {
        await entryPage.goto();
        await choose(entryPage.page, "Light");
        expect(await ground(entryPage.page)).toBe(LIGHT);
        // Without an explicit color-scheme the meta tag would let a dark OS draw form
        // controls and scrollbars dark on a light page.
        const scheme = await entryPage.page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
        expect(scheme).toBe("light");
      });
    });
  }

  test.describe("persistence", () => {
    test.use({ colorScheme: "light" });

    test("a choice survives a reload and is on <html> before hydration", async ({ entryPage }) => {
      const { page } = entryPage;
      await entryPage.goto();
      await choose(page, "Dark");
      expect(await stored(page)).toBe("dark");

      // Read the attribute at the earliest point we can observe — before React runs.
      // If the pre-paint script were missing, this would be null and the page would
      // flash light for a frame before correcting.
      await page.reload({ waitUntil: "commit" });
      await page.waitForFunction(() => document.documentElement !== null);
      expect(await themeAttr(page)).toBe("dark");

      await page.waitForFunction(() => window.Clerk?.loaded === true);
      await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
      expect(await ground(page)).toBe(DARK);
    });

    test("choosing System again clears the stored choice and hands back to the OS", async ({ entryPage }) => {
      const { page } = entryPage;
      await entryPage.goto();
      await choose(page, "Dark");
      await choose(page, "System");
      expect(await stored(page)).toBeNull();
      expect(await themeAttr(page)).toBeNull();
      expect(await ground(page)).toBe(LIGHT);
    });
  });

  test("arrow keys move the choice within the group", async ({ entryPage }) => {
    const { page } = entryPage;
    await entryPage.goto();
    await page.getByRole("radio", { name: "System" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(await themeAttr(page)).toBe("dark");
  });

  test("the browser chrome colour follows a forced theme", async ({ entryPage }) => {
    const { page } = entryPage;
    await entryPage.goto();
    const metas = () =>
      page.locator('meta[name="theme-color"]').evaluateAll((ms) => ms.map((m) => (m as HTMLMetaElement).content));

    await choose(page, "Dark");
    expect(new Set(await metas())).toEqual(new Set(["#14191e"]));
    await choose(page, "System");
    expect(await metas()).toEqual(expect.arrayContaining(["#f2f2f3", "#14191e"]));
  });

  test("is on the auth pages too", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("group", { name: "Theme" })).toBeVisible();
  });
});
