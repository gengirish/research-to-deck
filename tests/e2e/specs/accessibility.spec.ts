import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { FAILURE_TIMELINE, TOPIC } from "../fixtures/deckData";

/**
 * The accessibility contract, as tests.
 *
 * Two halves, and both are needed. `axe` catches the mechanical failures — contrast,
 * names, roles — across all three views. The assertions after it cover what axe
 * cannot see: that the *right* element got the role, that a mark and not only a
 * colour carries phase state, that the streaming log is reachable from a keyboard.
 *
 * Clerk's stub is excluded from the axe scan: `.cl-*` markup is not ours to fix, and
 * the real widget is not what renders here anyway.
 */

/** WCAG 2.1 AA, which is what MASTER.md §2.2 and the checklist are written against. */
function scan(page: Page) {
  return new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude(".cl-rootBox");
}

test.describe("Accessibility", () => {
  test.use({ authState: "signed-in" });

  test("the entry view has no axe violations", async ({ entryPage }) => {
    await entryPage.goto();
    const { violations } = await scan(entryPage.page).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.length} node(s)`)).toEqual([]);
  });

  test("the run view has no axe violations", async ({ deckApi, entryPage, runPage }) => {
    await entryPage.goto();
    await entryPage.fillForm({ topic: TOPIC });
    await entryPage.submit();
    await expect(runPage.runTitle).toBeVisible();
    deckApi.advance();
    await expect(runPage.phaseStat("OpenAlex screening")).toHaveText("4 papers");

    const { violations } = await scan(entryPage.page).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.length} node(s)`)).toEqual([]);
  });

  test("the result view has no axe violations", async ({ deckApi, entryPage, resultPage }) => {
    await entryPage.goto();
    await entryPage.fillForm({ topic: TOPIC });
    deckApi.finish();
    await entryPage.submit();
    await expect(resultPage.title).toBeVisible();

    const { violations } = await scan(entryPage.page).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.length} node(s)`)).toEqual([]);
  });

  test("every view has exactly one h1, and it names the thing on screen", async ({
    deckApi,
    entryPage,
    runPage,
    resultPage,
  }) => {
    await entryPage.goto();
    await expect(entryPage.page.locator("h1")).toHaveCount(1);

    await entryPage.fillForm({ topic: TOPIC });
    await entryPage.submit();
    await expect(runPage.runTitle).toBeVisible();
    // The run view used to open on an <h2> with no <h1> above it anywhere.
    await expect(entryPage.page.locator("h1")).toHaveCount(1);
    await expect(runPage.runTitle).toHaveText(TOPIC);

    deckApi.finish();
    await expect(resultPage.title).toBeVisible();
    await expect(entryPage.page.locator("h1")).toHaveCount(1);
  });

  test("the skip link is the first tab stop and jumps past the header", async ({ entryPage }) => {
    const { page } = entryPage;
    await entryPage.goto();
    await page.keyboard.press("Tab");

    const skip = page.locator(".skip-link");
    await expect(skip).toBeFocused();
    // Off-screen until focused, but never removed from the tab order.
    await expect(skip).toBeVisible();
    await expect(skip).toHaveAttribute("href", "#main");
    await expect(page.locator("main#main")).toHaveCount(1);
  });

  test("the paper-count radios are a labelled group, not orphaned inputs", async ({ entryPage }) => {
    await entryPage.goto();
    const group = entryPage.page.getByRole("group", { name: "Papers to read" });
    await expect(group).toBeVisible();
    await expect(group.getByRole("radio")).toHaveCount(3);
  });

  test("the email field keeps its helper text visible, not only in the placeholder", async ({ entryPage }) => {
    await entryPage.goto();
    await expect(entryPage.emailInput).toHaveAttribute("aria-describedby", "email-help");
    const help = entryPage.page.locator("#email-help");
    await expect(help).toBeVisible();
    // Still there after typing — which is the whole point of not using a placeholder.
    await entryPage.emailInput.fill("someone@example.com");
    await expect(help).toBeVisible();
  });

  test("progress is exposed as a progressbar, not just a coloured div", async ({ deckApi, entryPage, runPage }) => {
    await entryPage.goto();
    await entryPage.fillForm({ topic: TOPIC });
    await entryPage.submit();
    await expect(runPage.runTitle).toBeVisible();

    const bar = entryPage.page.getByRole("progressbar", { name: "Run progress" });
    await expect(bar).toHaveAttribute("aria-valuemin", "0");
    await expect(bar).toHaveAttribute("aria-valuemax", "100");

    deckApi.advance();
    await expect(runPage.progressPercent).toHaveText("15%");
    await expect(bar).toHaveAttribute("aria-valuenow", "15");
    await expect(bar).toHaveAttribute("aria-valuetext", /15% — OpenAlex screening/);
  });

  test("phase state is carried by a word, not by colour alone", async ({ deckApi, entryPage, runPage }) => {
    await entryPage.goto();
    await entryPage.fillForm({ topic: TOPIC });
    await entryPage.submit();
    await expect(runPage.runTitle).toBeVisible();
    deckApi.advance();
    await expect(runPage.phaseStat("OpenAlex screening")).toHaveText("4 papers");

    await expect(runPage.phase("Queued").locator(".vh")).toHaveText("done");
    await expect(runPage.phase("OpenAlex screening").locator(".vh")).toHaveText("in progress");
    await expect(runPage.phase("Deck ready").locator(".vh")).toHaveText("pending");

    // And the active step says so structurally, not only visually.
    await expect(runPage.phase("OpenAlex screening")).toHaveAttribute("aria-current", "step");
    await expect(runPage.phase("Deck ready")).not.toHaveAttribute("aria-current", "step");
  });

  test("the activity log is a keyboard-reachable live region", async ({ entryPage, runPage }) => {
    await entryPage.goto();
    await entryPage.fillForm({ topic: TOPIC });
    await entryPage.submit();
    await expect(runPage.runTitle).toBeVisible();

    await expect(runPage.log).toHaveAttribute("role", "log");
    await expect(runPage.log).toHaveAttribute("aria-live", "polite");
    // It scrolls, so it must be focusable — otherwise its content is keyboard-only
    // unreachable once it overflows 300px.
    await expect(runPage.log).toHaveAttribute("tabindex", "0");
    await runPage.log.focus();
    await expect(runPage.log).toBeFocused();
  });

  test("a failed run announces the error and offers a way on", async ({ deckApi, entryPage, runPage }) => {
    deckApi.useTimeline(FAILURE_TIMELINE);
    await entryPage.goto();
    await entryPage.fillForm({ topic: TOPIC });
    await entryPage.submit();
    await expect(runPage.runTitle).toBeVisible();

    deckApi.finish();
    await expect(runPage.error).toBeVisible();
    await expect(runPage.error).toHaveAttribute("role", "alert");
    await expect(runPage.backButton).toHaveText("Start another run");
  });

  test("losing contact with the run is surfaced, not swallowed", async ({ deckApi, entryPage, runPage }) => {
    await entryPage.goto();
    await entryPage.fillForm({ topic: TOPIC });
    await entryPage.submit();
    await expect(runPage.runTitle).toBeVisible();

    deckApi.breakPolling();

    // Three consecutive misses at ~1.5s each, then the banner.
    const notice = entryPage.page.getByRole("status");
    await expect(notice).toBeVisible({ timeout: 15_000 });
    await expect(notice).toContainText("Lost contact with the run");

    // And it clears itself once the API comes back — a stuck banner is its own bug.
    deckApi.restorePolling();
    await expect(notice).toBeHidden({ timeout: 15_000 });
  });

  test("interactive controls meet the 44px touch-target floor", async ({ entryPage }) => {
    await entryPage.goto();
    for (const locator of [entryPage.topicInput, entryPage.emailInput, entryPage.generateButton]) {
      const box = await locator.boundingBox();
      expect(box, "control should be laid out").not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("the topic field is at least 16px, so iOS does not zoom on focus", async ({ entryPage }) => {
    await entryPage.goto();
    for (const locator of [entryPage.topicInput, entryPage.emailInput]) {
      const px = await locator.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
      expect(px).toBeGreaterThanOrEqual(16);
    }
  });

  /**
   * The header is the one row that cannot wrap gracefully: brand, three anchors, a
   * badge and the auth control. It used to overflow 375px by 42px — and the server
   * renders it a node short, because the auth control waits for Clerk, so the
   * regression only showed up once signed-in state resolved.
   */
  for (const [width, height, label] of [
    [375, 667, "phone"],
    [667, 375, "phone landscape"],
    [768, 1024, "tablet"],
    [1024, 768, "laptop"],
    [1440, 900, "desktop"],
  ] as const) {
    test(`the entry view does not scroll sideways at ${label} (${width}x${height})`, async ({ entryPage }) => {
      await entryPage.page.setViewportSize({ width, height });
      await entryPage.goto();
      const overflow = await entryPage.page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
    });
  }

  test("the slide keeps the full width at tablet rather than sharing the row", async ({
    deckApi,
    entryPage,
    resultPage,
  }) => {
    await entryPage.page.setViewportSize({ width: 768, height: 1024 });
    await entryPage.goto();
    await entryPage.fillForm({ topic: TOPIC });
    deckApi.finish();
    await entryPage.submit();
    await expect(resultPage.title).toBeVisible();

    // At 768 the aside must wrap below: sharing the row left the 16:9 slide at 427px.
    const main = await entryPage.page.locator(".result-main").boundingBox();
    expect(main!.width).toBeGreaterThan(600);
  });

  test("the slide rail is one tab stop, and arrows move within it", async ({ deckApi, entryPage, resultPage }) => {
    await entryPage.goto();
    await entryPage.fillForm({ topic: TOPIC });
    deckApi.finish();
    await entryPage.submit();
    await expect(resultPage.title).toBeVisible();

    // Roving tabindex: only the selected thumb is reachable by Tab.
    await expect(resultPage.thumb(0)).toHaveAttribute("tabindex", "0");
    await expect(resultPage.thumb(1)).toHaveAttribute("tabindex", "-1");

    await resultPage.thumb(0).focus();
    await entryPage.page.keyboard.press("ArrowRight");
    await expect(resultPage.thumb(1)).toBeFocused();
    await expect(resultPage.thumb(1)).toHaveAttribute("aria-selected", "true");

    await entryPage.page.keyboard.press("End");
    await expect(resultPage.thumbs.last()).toBeFocused();
    await entryPage.page.keyboard.press("Home");
    await expect(resultPage.thumb(0)).toBeFocused();
  });
});
