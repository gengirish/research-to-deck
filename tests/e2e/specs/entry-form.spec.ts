import { expect, test } from "../fixtures/test";
import { TOPIC } from "../fixtures/deckData";

/** Everything between typing a topic and the run being accepted. */
test.describe("Job sheet", () => {
  test.use({ authState: "signed-in" });

  test.beforeEach(async ({ deckApi, entryPage }) => {
    void deckApi; // installs the mocked deck API before the first navigation
    await entryPage.goto();
  });

  test("defaults to 50 papers", async ({ entryPage }) => {
    await expect(entryPage.paperCount(50)).toBeChecked();
    await expect(entryPage.paperCount(10)).not.toBeChecked();
    await expect(entryPage.paperCount(100)).not.toBeChecked();
  });

  test("offers exactly the counts the API accepts", async ({ page }) => {
    // The route clamps to 10–100; the form must not offer anything outside it.
    const values = await page.locator('.seg-opt input[name="paperCount"]').evaluateAll((els) =>
      els.map((el) => Number((el as HTMLInputElement).value)),
    );
    expect(values).toEqual([10, 50, 100]);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  test("refuses to submit without a topic", async ({ entryPage, deckApi }) => {
    await entryPage.submit();

    await expect(entryPage.topicInput).toBeFocused();
    const valid = await entryPage.topicInput.evaluate((el) => (el as HTMLInputElement).checkValidity());
    expect(valid).toBe(false);
    expect(deckApi.createRequests).toHaveLength(0);
  });

  test("refuses a topic shorter than the API's minimum", async ({ entryPage, deckApi }) => {
    await entryPage.topicInput.fill("ai");
    await entryPage.submit();

    const valid = await entryPage.topicInput.evaluate((el) => (el as HTMLInputElement).checkValidity());
    expect(valid).toBe(false);
    expect(deckApi.createRequests).toHaveLength(0);
  });

  test("sends the topic, the chosen count and nothing else when no email is given", async ({ entryPage, deckApi }) => {
    await entryPage.fillForm({ topic: TOPIC, paperCount: 100 });
    await entryPage.submit();

    await expect.poll(() => deckApi.createRequests.length).toBe(1);
    expect(deckApi.createRequests[0]).toEqual({ topic: TOPIC, paperCount: 100 });
  });

  test("includes the email only when one is filled in", async ({ entryPage, deckApi }) => {
    await entryPage.fillForm({ topic: TOPIC, paperCount: 10, email: "ada@example.com" });
    await entryPage.submit();

    await expect.poll(() => deckApi.createRequests.length).toBe(1);
    expect(deckApi.createRequests[0]).toEqual({ topic: TOPIC, paperCount: 10, email: "ada@example.com" });
  });

  test("refuses a malformed email before it reaches the API", async ({ entryPage, deckApi }) => {
    await entryPage.fillForm({ topic: TOPIC, email: "not-an-email" });
    await entryPage.submit();

    const valid = await entryPage.emailInput.evaluate((el) => (el as HTMLInputElement).checkValidity());
    expect(valid).toBe(false);
    expect(deckApi.createRequests).toHaveLength(0);
  });

  test("hands the run over to the progress view once accepted", async ({ entryPage, runPage }) => {
    await entryPage.fillForm({ topic: TOPIC });
    await entryPage.submit();

    await expect(runPage.runTitle).toHaveText(TOPIC);
    await expect(entryPage.topicInput).toHaveCount(0);
  });
});

test.describe("When the run cannot be accepted", () => {
  test.use({ authState: "signed-in" });

  test("surfaces a queue outage without losing the form", async ({ deckApi, entryPage }) => {
    deckApi.failCreate({ status: 503, body: { error: "Queue unavailable, try again shortly" } });
    await entryPage.goto();

    await entryPage.fillForm({ topic: TOPIC });
    await entryPage.submit();

    await expect(entryPage.formError).toHaveText("Queue unavailable, try again shortly");
    await expect(entryPage.topicInput).toHaveValue(TOPIC);
    await expect(entryPage.generateButton).toBeEnabled();
  });

  test("explains an expired session in its own words", async ({ deckApi, entryPage }) => {
    // The raw body says "Sign in to generate a deck"; the form is expected to say
    // something more useful to someone who was signed in a moment ago.
    deckApi.failCreate({ status: 401, body: { error: "Sign in to generate a deck" } });
    await entryPage.goto();

    await entryPage.fillForm({ topic: TOPIC });
    await entryPage.submit();

    await expect(entryPage.formError).toHaveText("Your session expired. Sign in again to start a run.");
  });

  test("reports a rejected email configuration", async ({ deckApi, entryPage }) => {
    deckApi.failCreate({ status: 400, body: { error: "Email delivery is not configured on this deployment" } });
    await entryPage.goto();

    await entryPage.fillForm({ topic: TOPIC, email: "ada@example.com" });
    await entryPage.submit();

    await expect(entryPage.formError).toHaveText("Email delivery is not configured on this deployment");
  });

  test("clears a previous error when the next attempt succeeds", async ({ deckApi, entryPage, runPage }) => {
    deckApi.failCreate({ status: 503, body: { error: "Queue unavailable, try again shortly" } });
    await entryPage.goto();
    await entryPage.fillForm({ topic: TOPIC });
    await entryPage.submit();
    await expect(entryPage.formError).toBeVisible();

    deckApi.failCreate(null);
    await entryPage.submit();

    await expect(runPage.runTitle).toHaveText(TOPIC);
  });
});
