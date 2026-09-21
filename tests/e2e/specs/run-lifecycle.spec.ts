import { expect, test } from "../fixtures/test";
import { FAILURE_TIMELINE, TOPIC } from "../fixtures/deckData";

/**
 * The progress view, walked stage by stage.
 *
 * `deckApi.advance()` moves the run on; the page's own 1.5s poll notices, so every
 * assertion below is really asserting "the UI catches up on its next poll". No
 * waits for fixed durations — if a stage never lands, the assertion times out and
 * names what was missing.
 */
test.describe("A run in progress", () => {
  test.use({ authState: "signed-in" });

  test.beforeEach(async ({ deckApi, entryPage }) => {
    void deckApi;
    await entryPage.goto();
    await entryPage.fillForm({ topic: TOPIC });
    await entryPage.submit();
  });

  test("opens on the queued stage with the topic and job id", async ({ runPage }) => {
    await expect(runPage.heading).toHaveText("Run in progress");
    await expect(runPage.runTitle).toHaveText(TOPIC);
    await expect(runPage.page.locator(".run-head .job").first()).toContainText("Job #3f2504e0");
    await expect(runPage.progressLabel).toHaveText("Queued");
    await expect(runPage.logLine("Request accepted and queued for a worker")).toBeVisible();
  });

  test("lists every pipeline phase, in worker order", async ({ runPage }) => {
    await expect(runPage.phases).toHaveCount(7);
    const labels = await runPage.phases.locator(".label").allTextContents();
    expect(labels).toEqual([
      "Queued",
      "OpenAlex screening",
      "Full-text reading",
      "Evidence retrieval",
      "Slide composition",
      "Deck rendering",
      "Deck ready",
    ]);
  });

  test("reports the papers found once screening completes", async ({ deckApi, runPage }) => {
    deckApi.advance();

    await expect(runPage.progressLabel).toHaveText("OpenAlex screening");
    await expect(runPage.progressPercent).toHaveText("15%");
    await expect(runPage.phaseStat("OpenAlex screening")).toHaveText("4 papers");
    await expect(runPage.runSubtitle).toContainText("4 papers");
  });

  test("keeps stats blank for phases the run has not reached", async ({ deckApi, runPage }) => {
    deckApi.advance();
    await expect(runPage.phaseStat("OpenAlex screening")).toHaveText("4 papers");

    // The job already carries an ingest stat in later timeline entries, but this
    // run has not got there, so the row must stay empty rather than run ahead.
    await expect(runPage.phaseStat("Evidence retrieval")).toHaveText("—");
    await expect(runPage.phaseStat("Deck ready")).toHaveText("—");
  });

  test("admits each paper to the reading log as it lands", async ({ deckApi, runPage }) => {
    await expect(runPage.papersPanel).toContainText("Waiting for the first paper");

    deckApi.advance(2);

    await expect(runPage.paperRows).toHaveCount(4);
    await expect(runPage.papersCount).toHaveText("4 of 4");
    await expect(runPage.paperRow("Dense Passage Retrieval")).toContainText("EMNLP");
    await expect(runPage.paperRow("Dense Passage Retrieval")).toContainText("2020");
  });

  test("says which papers were read in full and which only at abstract level", async ({ deckApi, runPage }) => {
    deckApi.advance(2);

    await expect(runPage.paperRow("Retrieval-Augmented Generation").locator(".tag")).toHaveText("full text");
    await expect(runPage.paperRow("Enterprise Search at Scale").locator(".tag")).toHaveText("abstract");
  });

  test("strips the [n/total] counter from the paper titles", async ({ deckApi, runPage }) => {
    deckApi.advance(2);

    const first = await runPage.paperRows.first().textContent();
    expect(first).not.toMatch(/\[\d+\/\d+]/);
  });

  test("marks earlier phases done as the run moves through them", async ({ deckApi, runPage }) => {
    deckApi.advance(3);

    await expect(runPage.progressLabel).toHaveText("Evidence retrieval");
    expect(await runPage.phaseState("OpenAlex screening")).toBe("done");
    expect(await runPage.phaseState("Full-text reading")).toBe("done");
    expect(await runPage.phaseState("Evidence retrieval")).toBe("active");
    expect(await runPage.phaseState("Deck rendering")).toBe("todo");
  });

  test("accumulates the activity log rather than replacing it", async ({ deckApi, runPage }) => {
    await expect(runPage.logLines).toHaveCount(1);

    deckApi.advance(4);

    // queued + searching + 4 ingest + retrieving + 2 synthesizing
    await expect(runPage.logLines).toHaveCount(9);
    await expect(runPage.logLine("Request accepted and queued")).toBeVisible();
    await expect(runPage.logLine("Reranked the candidate pool")).toBeVisible();
    await expect(runPage.logLine("Repaired 1 unresolvable citation")).toHaveClass(/log-warn/);
  });

  test("shows the detail a log line carries, but not its raw object fields", async ({ deckApi, runPage }) => {
    deckApi.advance(3);

    const line = runPage.logLine("Reranked the candidate pool");
    await expect(line.locator(".log-detail")).toHaveText("kept: 30");
    await expect(line.locator(".log-stage")).toHaveText("retrieving");
  });

  test("runs an elapsed clock while the job is live", async ({ runPage }) => {
    await expect(runPage.elapsed).toHaveText(/Elapsed \d+:\d{2}/);
    const first = await runPage.elapsed.textContent();
    await expect(runPage.elapsed).not.toHaveText(first ?? "", { timeout: 5_000 });
  });

  test("returns to the job sheet without cancelling the run", async ({ entryPage, runPage }) => {
    await runPage.backButton.click();

    await expect(entryPage.topicInput).toBeVisible();
    await expect(runPage.runTitle).toHaveCount(0);
  });

  test("stops polling once the run is done", async ({ deckApi, page, resultPage }) => {
    deckApi.finish();
    await expect(resultPage.title).toBeVisible();

    let polls = 0;
    page.on("request", (req) => {
      if (/\/api\/decks\/[^/]+\?/.test(req.url())) polls++;
    });
    await page.waitForTimeout(4_000);
    expect(polls).toBe(0);
  });
});

test.describe("A run that fails", () => {
  test.use({ authState: "signed-in" });

  test.beforeEach(async ({ deckApi, entryPage }) => {
    deckApi.useTimeline(FAILURE_TIMELINE);
    await entryPage.goto();
    await entryPage.fillForm({ topic: TOPIC });
    await entryPage.submit();
  });

  test("says where it stopped and why", async ({ deckApi, runPage }) => {
    deckApi.advance(2);

    await expect(runPage.heading).toHaveText("Run failed");
    await expect(runPage.error).toHaveText("OpenAlex returned no open-access PDFs for this topic");
    await expect(runPage.runSubtitle).toContainText("the log below shows where it stopped");
  });

  test("marks the failed phase rather than the progress bar's end", async ({ deckApi, runPage }) => {
    deckApi.advance(2);

    expect(await runPage.phaseState("Full-text reading")).toBe("failed");
    await expect(runPage.meter).toHaveClass(/failed/);
    await expect(runPage.progressLabel).toHaveText("Stopped");
  });

  test("offers another run instead of a way back", async ({ deckApi, entryPage, runPage }) => {
    deckApi.advance(2);

    await expect(runPage.backButton).toHaveText("Start another run");
    await runPage.backButton.click();
    await expect(entryPage.topicInput).toBeVisible();
  });

  test("stops polling once the run has failed", async ({ deckApi, page, runPage }) => {
    deckApi.advance(2);
    await expect(runPage.heading).toHaveText("Run failed");

    let polls = 0;
    page.on("request", (req) => {
      if (/\/api\/decks\/[^/]+\?/.test(req.url())) polls++;
    });
    await page.waitForTimeout(4_000);
    expect(polls).toBe(0);
  });
});
