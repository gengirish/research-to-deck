import { expect, test } from "../fixtures/test";

/**
 * The marketing surface. Thin on behaviour, but it is the whole first impression
 * and every claim on it is one the pipeline has to keep, so it is worth pinning.
 */
test.describe("Landing page", () => {
  test.beforeEach(async ({ entryPage }) => {
    await entryPage.goto();
  });

  test("leads with the promise and the job sheet", async ({ page, entryPage }) => {
    await expect(page).toHaveTitle(/Research-to-Deck/);
    await expect(entryPage.heroTitle).toContainText("Fifty papers in,");
    await expect(entryPage.heroTitle).toContainText("one cited deck out.");
    await expect(page.getByText("Job sheet — new run")).toBeVisible();
    await expect(entryPage.topicInput).toBeVisible();
  });

  test("states the output spec a run is held to", async ({ page }) => {
    const spec = page.locator("aside.hero-aside table.table").first();
    await expect(spec.getByRole("row").filter({ hasText: "Slides" })).toContainText("8–12 + references");
    await expect(spec.getByRole("row").filter({ hasText: "Citations" })).toContainText("per bullet");
    await expect(spec.getByRole("row").filter({ hasText: "Format" })).toContainText(".pptx");
    await expect(spec.getByRole("row").filter({ hasText: "Corpus" })).toContainText("OpenAlex");
  });

  test("explains the pipeline in three steps", async ({ page }) => {
    const steps = page.locator(".steps .step");
    await expect(steps).toHaveCount(3);
    await expect(steps.nth(0)).toContainText("Screen the corpus");
    await expect(steps.nth(1)).toContainText("Read and index");
    await expect(steps.nth(2)).toContainText("Compose the deck");
  });

  test("navigation jumps to the method and verifiability sections", async ({ page, entryPage }) => {
    await page.getByRole("link", { name: "Method" }).click();
    await expect(page).toHaveURL(/#how$/);
    await expect(entryPage.section("how")).toBeInViewport();

    await page.getByRole("link", { name: "Verifiability" }).click();
    await expect(page).toHaveURL(/#verifiability$/);
    await expect(entryPage.section("verifiability")).toBeInViewport();
  });

  test("makes four verifiability claims and answers four questions", async ({ page }) => {
    await expect(page.locator(".proof-row")).toHaveCount(4);
    await expect(page.locator(".faq")).toHaveCount(4);
    await expect(page.getByText("Where do the papers come from?")).toBeVisible();
    await expect(page.getByText("Is anything invented?")).toBeVisible();
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

  test("keeps the hero image decorative rather than announcing it", async ({ page }) => {
    // The corpus photograph carries no information a screen reader needs; the
    // caption beside it does. An empty alt is the intent, not an oversight.
    const figure = page.locator("figure img");
    await expect(figure).toHaveAttribute("alt", "");
    await expect(page.locator(".fig-caption")).toContainText("The corpus, as read");
  });
});

test.describe("Landing page on a phone", () => {
  test("stacks the hero and keeps the form usable", async ({ page, entryPage }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chrome", "mobile layout only");
    await entryPage.goto();
    await expect(entryPage.heroTitle).toBeVisible();
    await expect(entryPage.topicInput).toBeVisible();

    // Nothing should force a sideways scroll on a 393px viewport.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
