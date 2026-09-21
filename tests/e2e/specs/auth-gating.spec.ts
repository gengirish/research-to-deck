import { expect, test } from "../fixtures/test";

/**
 * The auth boundary as the visitor meets it.
 *
 * A run reads up to 100 papers and bills model usage, so it is tied to an account
 * — `POST /api/decks` enforces that, and the form is expected to say so before
 * anyone types a topic. These specs cover the *offer*; completing a real sign-in
 * needs a live Clerk instance and is out of scope for the suite (see clerkStub.ts).
 */

test.describe("Signed out", () => {
  test.use({ authState: "signed-out" });

  test("offers sign-in instead of a submit button", async ({ entryPage }) => {
    await entryPage.goto();

    await expect(entryPage.signInToGenerateButton).toBeVisible();
    await expect(entryPage.generateButton).toHaveCount(0);
    await expect(entryPage.submitNote).toHaveText("Free account · your runs stay scoped to you");
  });

  test("shows a sign-in control in the header, not a user menu", async ({ entryPage }) => {
    await entryPage.goto();

    await expect(entryPage.headerSignInButton).toBeVisible();
    await expect(entryPage.userButton).toHaveCount(0);
  });

  test("opens the sign-in modal and keeps the topic already typed", async ({ page, entryPage }) => {
    await entryPage.goto();
    await entryPage.topicInput.fill("graph neural networks for drug discovery");

    await entryPage.signInToGenerateButton.click();

    await expect(page.locator("html")).toHaveAttribute("data-e2e-clerk-modal", "sign-in");
    // The form is not remounted by opening the modal, so the work survives.
    await expect(entryPage.topicInput).toHaveValue("graph neural networks for drug discovery");
  });

  test("serves the dedicated sign-in and sign-up routes", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.locator("[data-e2e-clerk-component='SignIn']")).toBeVisible();

    await page.goto("/sign-up");
    await expect(page.locator("[data-e2e-clerk-component='SignUp']")).toBeVisible();
  });
});

test.describe("Signed in", () => {
  test.use({ authState: "signed-in" });

  test("swaps the gate for a live submit button", async ({ entryPage }) => {
    await entryPage.goto();

    await expect(entryPage.generateButton).toBeVisible();
    await expect(entryPage.generateButton).toBeEnabled();
    await expect(entryPage.signInToGenerateButton).toHaveCount(0);
    await expect(entryPage.submitNote).toHaveText("A few minutes · OpenAlex · .pptx with speaker notes");
  });

  test("shows the user menu in the header", async ({ entryPage }) => {
    await entryPage.goto();

    await expect(entryPage.userButton).toBeVisible();
    await expect(entryPage.headerSignInButton).toHaveCount(0);
  });
});

test.describe("First paint", () => {
  test("never flashes the wrong control before Clerk resolves", async ({ page }) => {
    // Until `useAuth` reports, the form must show a neutral disabled button — not
    // "Sign in" at someone who is already signed in, and not a live submit at
    // someone who is not. The server HTML is the only place to check that.
    const response = await page.request.get("/");
    const html = await response.text();

    expect(html).toContain("Generate deck");
    expect(html).toContain("disabled");
    expect(html).not.toContain("Sign in to generate");
  });
});
