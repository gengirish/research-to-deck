import { expect, test } from "../fixtures/test";

/**
 * The landing page, after the move to minimalism.
 *
 * It used to argue its case at length — output spec, run figures, verifiability,
 * FAQ, a closing CTA — and the tests pinned every claim. All of that is gone. What
 * is left is a statement, the form, three steps and a footer, so most of what this
 * file now asserts is *absence*: the page must not quietly grow those sections back.
 */
test.describe("Landing page", () => {
  test.beforeEach(async ({ entryPage }) => {
    await entryPage.goto();
  });

  test("leads with the promise and goes straight to the form", async ({ page, entryPage }) => {
    await expect(page).toHaveTitle(/Research-to-Deck/);
    await expect(entryPage.heroTitle).toContainText("Fifty papers in,");
    await expect(entryPage.heroTitle).toContainText("one cited deck out.");
    await expect(entryPage.topicInput).toBeVisible();

    // The form is above the fold: nothing sits between the statement and the topic.
    const box = await entryPage.topicInput.boundingBox();
    expect(box!.y).toBeLessThan(page.viewportSize()!.height);
  });

  test("explains the pipeline in three steps, one line each", async ({ page }) => {
    const steps = page.locator(".steps .step");
    await expect(steps).toHaveCount(3);
    await expect(steps.nth(0)).toContainText("Screen");
    await expect(steps.nth(1)).toContainText("Read");
    await expect(steps.nth(2)).toContainText("Compose");
  });

  test("is four blocks and nothing else", async ({ page }) => {
    // Statement, form, steps, footer. If a section comes back, this is where it shows.
    await expect(page.locator(".lede-block")).toHaveCount(1);
    await expect(page.locator("form.job-form")).toHaveCount(1);
    await expect(page.locator(".steps")).toHaveCount(1);
    await expect(page.locator("footer.site-footer")).toHaveCount(1);

    for (const gone of [
      ".hero-aside",
      ".plate",
      ".reverse",
      ".duotone",
      ".faq",
      ".proof-row",
      ".out-card",
      ".datarow",
      ".cta",
      ".fig-caption",
      ".sheet-head",
      ".eyebrow",
      ".hero-band",
    ]) {
      await expect(page.locator(gone), `${gone} should be gone`).toHaveCount(0);
    }
  });

  test("carries no registration marks anywhere", async ({ page }) => {
    // The drawing-sheet ornament was removed wholesale; a stray `<i class="corner">`
    // would be a half-reverted change, not a decoration.
    await expect(page.locator("i.corner")).toHaveCount(0);
    await expect(page.locator(".blueprint")).toHaveCount(0);
  });

  test("keeps the header to the brand and the account", async ({ page }) => {
    // The in-page anchors pointed at sections that no longer exist.
    await expect(page.getByRole("link", { name: "Method" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Verifiability" })).toHaveCount(0);
    await expect(page.locator(".brand-lock")).toBeVisible();

    // Every remaining in-page anchor must still resolve to something.
    const hrefs = await page.locator('a[href^="#"]').evaluateAll((as) =>
      as.map((a) => a.getAttribute("href")!).filter((h) => h.length > 1),
    );
    for (const href of hrefs) {
      await expect(page.locator(href), `${href} should exist`).toHaveCount(1);
    }
  });

  test("renders without console errors or failed requests", async ({ page, entryPage }) => {
    const problems: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") problems.push(`console: ${msg.text()}`);
    });
    page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
    page.on("response", (res) => {
      if (res.status() >= 400) problems.push(`${res.status()} ${res.url()}`);
    });

    await entryPage.goto();
    await expect(entryPage.heroTitle).toBeVisible();
    expect(problems).toEqual([]);
  });
});

test.describe("Landing page on a phone", () => {
  test("keeps the form usable and does not scroll sideways", async ({ page, entryPage }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chrome", "mobile layout only");
    await entryPage.goto();
    await expect(entryPage.heroTitle).toBeVisible();
    await expect(entryPage.topicInput).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
