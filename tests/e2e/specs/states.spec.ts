import { expect, test } from "../fixtures/test";
import { FAILURE_TIMELINE, TIMELINE, TOPIC } from "../fixtures/deckData";

/**
 * Phase 4 — the unhappy and in-between states.
 *
 * Everything the happy-path specs never see: the panel before the first paper, the
 * moment between "accepted" and the first poll, a run that died, and the only
 * action on the page whose result happens outside it (the download).
 *
 * These assert behaviour, not pixels — the one measurement here is a bounding box,
 * and it is there because "the layout must not jump" is the requirement itself, not
 * a style preference.
 */

test.describe("Before the first paper", () => {
  test.use({ authState: "signed-in" });

  test.beforeEach(async ({ deckApi, entryPage }) => {
    void deckApi;
    await entryPage.goto();
    await entryPage.fillForm({ topic: TOPIC });
    await entryPage.submit();
  });

  test("draws five skeleton rows instead of a sentence", async ({ runPage }) => {
    await expect(runPage.paperSkeletonRows).toHaveCount(5);
    await expect(runPage.paperRows).toHaveCount(0);
  });

  test("still tells a screen reader what it is waiting for", async ({ runPage }) => {
    // The bars are aria-hidden; the sentence the prose used to carry survives as
    // visually hidden text, so the panel is not announced as an empty table.
    await expect(runPage.papersPanel).toContainText("Waiting for the first paper");
    await expect(runPage.papersPanel.locator("table[aria-hidden='true']")).toHaveCount(1);
  });

  test("uses the same column widths the real rows will", async ({ deckApi, runPage }) => {
    const widthsOf = () =>
      runPage.papersPanel
        .locator("thead th")
        .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));

    const skeleton = await widthsOf();
    expect(skeleton).toHaveLength(4);

    deckApi.advance(2); // through screening, into ingesting
    await expect(runPage.paperRows).toHaveCount(4);
    await expect(runPage.paperSkeletonRows).toHaveCount(0);

    // Same header cells, same widths: the arriving data slotted into the drawing
    // rather than replacing it with a differently shaped table.
    expect(await widthsOf()).toEqual(skeleton);
  });

  test("gives way to the real rows once ingest reports", async ({ deckApi, runPage }) => {
    deckApi.advance(2);
    await expect(runPage.paperRow("Dense Passage Retrieval")).toBeVisible();
    await expect(runPage.paperSkeletonRows).toHaveCount(0);
  });
});

test.describe("Handing a run over", () => {
  test.use({ authState: "signed-in" });

  test("keeps the topic on screen between the form and the run view", async ({ deckApi, entryPage, runPage }) => {
    // Widen the gap the hand-off exists to fill; without the delay the first poll
    // answers so fast that the intermediate state is unobservable.
    deckApi.delayStatus(1200);
    await entryPage.goto();
    await entryPage.fillForm({ topic: TOPIC });
    await entryPage.submit();

    // The form is gone, the topic is not, and the page says what it is doing.
    await expect(runPage.runTitle).toHaveText(TOPIC);
    await expect(entryPage.topicInput).toHaveCount(0);
    await expect(runPage.heading).toHaveText("Starting the run");
    await expect(runPage.page.locator(".meter-sweep")).toBeVisible();

    // …and then the real run view takes over, with the heading still in place.
    deckApi.delayStatus(0);
    await expect(runPage.heading).toHaveText("Run in progress");
    await expect(runPage.runTitle).toHaveText(TOPIC);
  });

  test("returns to the job sheet, filled in, when the run is refused", async ({ deckApi, entryPage }) => {
    deckApi.failCreate({ status: 503, body: { error: "Queue unavailable, try again shortly" } });
    await entryPage.goto();
    await entryPage.fillForm({ topic: TOPIC });
    await entryPage.submit();

    await expect(entryPage.formError).toHaveText("Queue unavailable, try again shortly");
    await expect(entryPage.topicInput).toHaveValue(TOPIC);
  });

  test("crossfades rather than cutting", async ({ deckApi, entryPage, page }) => {
    void deckApi;
    await entryPage.goto();
    await entryPage.fillForm({ topic: TOPIC });
    await entryPage.submit();

    const name = await page
      .locator(".shell > .view-fade")
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(name).toBe("view-fade");
  });
});

test.describe("A run that failed", () => {
  test.use({ authState: "signed-in" });

  test.beforeEach(async ({ deckApi, entryPage }) => {
    deckApi.useTimeline(FAILURE_TIMELINE);
    await entryPage.goto();
    await entryPage.fillForm({ topic: TOPIC, paperCount: 100, email: "ada@example.com" });
    await entryPage.submit();
    deckApi.advance(2);
  });

  test("pairs the reason with a way out", async ({ runPage }) => {
    await expect(runPage.error).toHaveText("OpenAlex returned no open-access PDFs for this topic");
    await expect(runPage.retryButton).toBeVisible();
    // The retry is the primary action here; leaving is still offered, subordinate.
    await expect(runPage.retryButton).toHaveClass(/btn-primary/);
    await expect(runPage.backButton).toHaveText("Start another run");
  });

  test("re-submits the same topic, count and email", async ({ deckApi, runPage }) => {
    deckApi.useTimeline(TIMELINE);
    await runPage.retryButton.click();

    await expect.poll(() => deckApi.createRequests.length).toBe(2);
    expect(deckApi.createRequests[1]).toEqual(deckApi.createRequests[0]);
    expect(deckApi.createRequests[1]).toEqual({ topic: TOPIC, paperCount: 100, email: "ada@example.com" });
  });

  test("starts a fresh run rather than re-rendering the dead one", async ({ deckApi, runPage }) => {
    deckApi.useTimeline(TIMELINE);
    await runPage.retryButton.click();

    await expect(runPage.heading).toHaveText("Run in progress");
    await expect(runPage.retryButton).toHaveCount(0);
    await expect(runPage.runTitle).toHaveText(TOPIC);
  });

  test("stops shimmering rows that are never coming", async ({ runPage }) => {
    // A skeleton is a promise about the next second. On a dead run there is no
    // next second, so the panel states the absence instead of animating it.
    await expect(runPage.paperSkeletonRows).toHaveCount(0);
    await expect(runPage.papersPanel).toContainText("the run stopped before any paper was read");
  });

  test("keeps the retry a full touch target", async ({ runPage }) => {
    const box = await runPage.retryButton.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});

test.describe("Downloading the deck", () => {
  test.use({ authState: "signed-in" });

  test.beforeEach(async ({ deckApi, entryPage, resultPage }) => {
    deckApi.finish();
    await entryPage.goto();
    await entryPage.fillForm({ topic: TOPIC });
    await entryPage.submit();
    await expect(resultPage.downloadLink).toBeVisible();
  });

  test("announces the download politely, in a region that was already there", async ({ resultPage }) => {
    // aria-live only announces changes inside a region that predates them, so the
    // dock must exist before the first toast does.
    await expect(resultPage.toastDock).toHaveAttribute("aria-live", "polite");
    await expect(resultPage.toast).toHaveCount(0);

    const download = resultPage.page.waitForEvent("download");
    await resultPage.downloadLink.click();
    await download;

    await expect(resultPage.toast).toBeVisible();
    await expect(resultPage.toast).toContainText("Download started");
    await expect(resultPage.toast).toContainText(".pptx");
  });

  test("does not take focus", async ({ resultPage }) => {
    const download = resultPage.page.waitForEvent("download");
    await resultPage.downloadLink.click();
    await download;
    await expect(resultPage.toast).toBeVisible();

    // The person's place on the page is theirs. The toast is reachable by Tab, and
    // ignorable otherwise.
    await expect(resultPage.downloadLink).toBeFocused();
    await expect(resultPage.toastClose).not.toBeFocused();
  });

  test("dismisses itself after about four seconds", async ({ resultPage }) => {
    const download = resultPage.page.waitForEvent("download");
    await resultPage.downloadLink.click();
    await download;
    await expect(resultPage.toast).toBeVisible();

    await expect(resultPage.toast).toHaveCount(0, { timeout: 8000 });
    // The region itself stays mounted for the next announcement.
    await expect(resultPage.toastDock).toHaveCount(1);
  });

  test("can be dismissed by hand, from a 44px target", async ({ resultPage }) => {
    const download = resultPage.page.waitForEvent("download");
    await resultPage.downloadLink.click();
    await download;

    const box = await resultPage.toastClose.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);

    await resultPage.toastClose.click();
    await expect(resultPage.toast).toHaveCount(0);
  });

  test("still confirms when motion is reduced", async ({ page, resultPage }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });

    const download = resultPage.page.waitForEvent("download");
    await resultPage.downloadLink.click();
    await download;

    await expect(resultPage.toast).toBeVisible();
    // Named off rather than sped to 0.01ms, so it arrives as a cut, not a flicker.
    const name = await resultPage.toast.evaluate((el) => getComputedStyle(el).animationName);
    expect(name).toBe("none");
  });
});

test.describe("Moving between slides", () => {
  test.use({ authState: "signed-in" });

  test.beforeEach(async ({ deckApi, entryPage, resultPage }) => {
    deckApi.finish();
    await entryPage.goto();
    await entryPage.fillForm({ topic: TOPIC });
    await entryPage.submit();
    await expect(resultPage.slideTitle).toBeVisible();
  });

  test("crossfades the slide instead of swapping it", async ({ resultPage }) => {
    const style = await resultPage.slidePanel.evaluate((el) => {
      const s = getComputedStyle(el);
      return { name: s.animationName, duration: s.animationDuration };
    });
    expect(style.name).toBe("slide-crossfade");
    expect(style.duration).not.toBe("0s");
  });

  test("does not move the frame around it", async ({ resultPage }) => {
    const frame = resultPage.page.locator(".result-main .blueprint").first();
    const before = await frame.boundingBox();

    await resultPage.selectSlide(1);
    await expect(resultPage.activeThumb).toHaveCount(1);
    await expect(resultPage.slidePanel).toBeVisible();

    const after = await frame.boundingBox();
    expect(Math.round(after?.x ?? 0)).toBe(Math.round(before?.x ?? 0));
    expect(Math.round(after?.y ?? 0)).toBe(Math.round(before?.y ?? 0));
    expect(Math.round(after?.width ?? 0)).toBe(Math.round(before?.width ?? 0));
  });

  test("replays the fade on each selection", async ({ resultPage }) => {
    await resultPage.selectSlide(1);
    await expect(resultPage.slidePanel).toHaveClass(/slide-crossfade/);
    await resultPage.selectSlide(2);
    await expect(resultPage.slidePanel).toHaveClass(/slide-crossfade/);
  });
});
