import { expect, test } from "../fixtures/test";
import { DECK, TOPIC } from "../fixtures/deckData";

/**
 * The finished deck.
 *
 * The citation contract is the product — "a bullet without a valid citation must
 * never reach the deck" — so most of what follows is about whether the screen
 * actually shows the evidence behind each claim, not just that it rendered.
 */
test.describe("A finished deck", () => {
  test.use({ authState: "signed-in" });

  test.beforeEach(async ({ deckApi, entryPage, resultPage }) => {
    await entryPage.goto();
    await entryPage.fillForm({ topic: TOPIC });
    deckApi.finish();
    await entryPage.submit();
    await expect(resultPage.title).toBeVisible();
  });

  test("announces the deck, its size and its sources", async ({ resultPage }) => {
    await expect(resultPage.banner).toHaveText("Deck ready · 3 slides · 4 references");
    await expect(resultPage.title).toHaveText(DECK.title);
    await expect(resultPage.subtitle).toHaveText(DECK.subtitle);
  });

  test("shows one thumbnail per slide, with its source count", async ({ resultPage }) => {
    await expect(resultPage.thumbs).toHaveCount(3);
    await expect(resultPage.thumb(0)).toContainText("Retrieval quality outweighs model size");
    await expect(resultPage.thumb(0)).toContainText("2 srcs");
    await expect(resultPage.thumb(2)).toContainText("1 src");
  });

  test("opens on the first slide", async ({ resultPage }) => {
    await expect(resultPage.activeThumb).toHaveCount(1);
    await expect(resultPage.thumb(0)).toHaveAttribute("aria-current", "true");
    await expect(resultPage.slideTitle).toHaveText(DECK.slides[0].title);
    await expect(resultPage.slideCounter).toHaveText("01 / 03");
  });

  test("carries the reference numbers on the bullets themselves", async ({ resultPage }) => {
    await expect(resultPage.slideBullets).toHaveCount(2);
    await expect(resultPage.slideBullets.nth(0)).toContainText(DECK.slides[0].bullets[0].text);
    await expect(resultPage.bulletRefs(0)).toHaveText("[1] [2]");
    await expect(resultPage.bulletRefs(1)).toHaveText("[2]");
  });

  test("names the sources under the slide as short citations", async ({ resultPage }) => {
    await expect(resultPage.slideFooter).toContainText("Lewis, Perez, Piktus, et al. (2020)");
    await expect(resultPage.slideFooter).toContainText("Karpukhin, Oguz, Min, et al. (2020)");
  });

  test("lists this slide's sources with resolvable links", async ({ resultPage }) => {
    await expect(resultPage.sources).toHaveCount(2);
    await expect(resultPage.sources.first()).toContainText("[1]");
    await expect(resultPage.sources.first()).toContainText("Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks");

    const link = resultPage.sources.first().getByRole("link");
    await expect(link).toHaveAttribute("href", "https://doi.org/10.5555/rag2020");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noreferrer");
    // The visible text drops the scheme; the href keeps it.
    await expect(link).toHaveText("doi.org/10.5555/rag2020");
  });

  test("rates a slide by how many sources stand behind it", async ({ resultPage }) => {
    await expect(resultPage.confidenceTag).toHaveText("2 sources");
    await expect(resultPage.coverage).toHaveText("100%");

    await resultPage.selectSlide(2);

    await expect(resultPage.confidenceTag).toHaveText("Single source");
    await expect(resultPage.coverage).toHaveText("50%");
  });

  test("switches slides from the thumbnail strip", async ({ resultPage }) => {
    await resultPage.selectSlide(1);

    await expect(resultPage.slideTitle).toHaveText(DECK.slides[1].title);
    await expect(resultPage.slideCounter).toHaveText("02 / 03");
    await expect(resultPage.thumb(1)).toHaveAttribute("aria-current", "true");
    await expect(resultPage.thumb(0)).toHaveAttribute("aria-current", "false");
    await expect(resultPage.sources).toHaveCount(2);
    await expect(resultPage.sources.first()).toContainText("[2]");
  });

  test("shows the speaker notes without the renderer's source footer", async ({ resultPage }) => {
    // "Sources on this slide: [1] [2]" is appended for the .pptx; on screen the
    // sources panel already says it, so the notes must stop before it.
    await expect(resultPage.notes).toHaveText("Lead with the cost argument here.");
    await expect(resultPage.notes).not.toContainText("Sources on this slide");
  });

  test("keeps the run's own record next to the deck", async ({ resultPage }) => {
    await expect(resultPage.record("Papers screened")).toHaveText("4");
    await expect(resultPage.record("Read in full text")).toHaveText("3 of 4");
    await expect(resultPage.record("Chunks indexed")).toHaveText("1,284");
    await expect(resultPage.record("Passages retrieved")).toHaveText("30");
    await expect(resultPage.record("Slides / references")).toHaveText("3 / 4");
    await expect(resultPage.record("Run time")).toHaveText("116s");
    await expect(resultPage.statsLine).toHaveText(DECK.stats_line);
  });

  test("downloads the .pptx", async ({ deckApi, resultPage }) => {
    await expect(resultPage.downloadLink).toHaveAttribute("href", /\/api\/decks\/.*\/download$/);

    const download = await Promise.all([
      resultPage.page.waitForEvent("download"),
      resultPage.downloadLink.click(),
    ]).then(([d]) => d);

    expect(download.suggestedFilename()).toBe("research-to-deck.pptx");
    expect(deckApi.downloadCount).toBe(1);
  });

  test("starts a fresh run from a clean job sheet", async ({ entryPage, resultPage }) => {
    await resultPage.newRunButton.click();

    await expect(entryPage.topicInput).toBeVisible();
    await expect(entryPage.topicInput).toHaveValue(TOPIC); // the topic is kept, the run is not
    await expect(resultPage.title).toHaveCount(0);
    await expect(entryPage.formError).toHaveCount(0);
  });
});

test.describe("A finished deck on a phone", () => {
  test.use({ authState: "signed-in" });

  test("keeps the slide, its sources and the download reachable", async ({ deckApi, entryPage, page, resultPage }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chrome", "mobile layout only");
    await entryPage.goto();
    await entryPage.fillForm({ topic: TOPIC });
    deckApi.finish();
    await entryPage.submit();

    await expect(resultPage.slideTitle).toBeVisible();
    await expect(resultPage.downloadLink).toBeVisible();
    await resultPage.sources.first().scrollIntoViewIfNeeded();
    await expect(resultPage.sources.first()).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
