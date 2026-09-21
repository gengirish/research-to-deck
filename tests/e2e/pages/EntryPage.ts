import type { Locator, Page } from "@playwright/test";

/**
 * The landing page and the job sheet on it.
 *
 * The app ships no `data-testid` hooks, so these locators go through roles, labels
 * and visible text — which is also what the person using the page goes through. A
 * locator that breaks here is usually a real accessibility regression, not a test
 * that needs loosening.
 */
export class EntryPage {
  readonly topicInput: Locator;
  readonly emailInput: Locator;
  readonly generateButton: Locator;
  readonly signInToGenerateButton: Locator;
  readonly headerSignInButton: Locator;
  readonly userButton: Locator;
  readonly submitNote: Locator;
  readonly formError: Locator;
  readonly heroTitle: Locator;

  constructor(readonly page: Page) {
    this.topicInput = page.getByLabel("Research topic");
    this.emailInput = page.getByLabel("Email the deck (optional)");
    this.generateButton = page.getByRole("button", { name: "Generate deck" });
    this.signInToGenerateButton = page.getByRole("button", { name: "Sign in to generate" });
    this.headerSignInButton = page.locator(".nav-auth").getByRole("button", { name: "Sign in" });
    this.userButton = page.locator("[data-e2e-user-button]");
    this.submitNote = page.locator(".submit-note");
    this.formError = page.locator(".form-error");
    this.heroTitle = page.locator("h1.hero-title");
  }

  async goto(): Promise<void> {
    await this.page.goto("/");
    // Clerk resolves before the form decides which submit control to show; waiting
    // on that keeps every later assertion off the first-paint disabled state.
    await this.page.waitForFunction(() => window.Clerk?.loaded === true);
  }

  /** The radio for a paper count, by its visible number. */
  paperCount(n: number): Locator {
    return this.page.locator(`.seg-opt input[name="paperCount"][value="${n}"]`);
  }

  async choosePaperCount(n: number): Promise<void> {
    // The input sits under a styled label, so click the label the user sees.
    await this.page.locator(".seg-opt").filter({ hasText: new RegExp(`^${n}$`) }).click();
  }

  async fillForm({ topic, paperCount, email }: { topic: string; paperCount?: number; email?: string }): Promise<void> {
    await this.topicInput.fill(topic);
    if (paperCount !== undefined) await this.choosePaperCount(paperCount);
    if (email !== undefined) await this.emailInput.fill(email);
  }

  async submit(): Promise<void> {
    await this.generateButton.click();
  }

  /** The in-page anchor targets the header links jump to. */
  section(id: string): Locator {
    return this.page.locator(`#${id}`);
  }
}

declare global {
  interface Window {
    Clerk?: { loaded?: boolean; __e2e?: { openSignIn: number; openSignUp: number; signOut: number } };
  }
}
