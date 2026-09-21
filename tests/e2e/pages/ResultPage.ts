import type { Locator, Page } from "@playwright/test";

/** The finished deck: thumbnail strip, slide canvas, notes, sources and run record. */
export class ResultPage {
  readonly banner: Locator;
  readonly title: Locator;
  readonly subtitle: Locator;
  readonly newRunButton: Locator;
  readonly downloadLink: Locator;
  readonly thumbs: Locator;
  readonly activeThumb: Locator;
  readonly slideTitle: Locator;
  readonly slideBullets: Locator;
  readonly slideFooter: Locator;
  readonly slideCounter: Locator;
  readonly sourceCount: Locator;
  readonly notes: Locator;
  readonly confidenceTag: Locator;
  readonly coverage: Locator;
  readonly sources: Locator;
  readonly runRecordRows: Locator;
  readonly statsLine: Locator;
  readonly slidePanel: Locator;
  readonly toast: Locator;
  readonly toastDock: Locator;
  readonly toastClose: Locator;

  constructor(readonly page: Page) {
    this.banner = page.locator(".result-head .panel-label");
    this.title = page.locator("h1.result-title");
    this.subtitle = page.locator(".result-head p");
    this.newRunButton = page.getByRole("button", { name: "New run" });
    this.downloadLink = page.getByRole("link", { name: "Download .pptx" });
    this.thumbs = page.locator("button.thumb");
    this.activeThumb = page.locator("button.thumb-on");
    this.slideTitle = page.locator(".slide h3");
    this.slideBullets = page.locator(".slide-bullet");
    this.slideFooter = page.locator(".slide-foot");
    this.slideCounter = page.locator(".slide-head .count > span").last();
    this.sourceCount = page.locator(".slide-head .count .n");
    this.notes = page.locator(".notes-panel p");
    this.confidenceTag = page.locator(".result-aside .panel-head .tag");
    this.coverage = page.locator(".bar-legend > span").last();
    this.sources = page.locator(".source");
    this.runRecordRows = page.locator(".result-aside tbody tr");
    this.statsLine = page.locator(".result-aside p").last();
    this.slidePanel = page.locator("#slide-panel");
    // The dock is always mounted — that is what makes aria-live announce — so
    // "is there a toast" is a question about its child, not about the region.
    this.toastDock = page.locator(".toast-dock");
    this.toast = page.locator(".toast");
    this.toastClose = page.getByRole("button", { name: "Dismiss notification" });
  }

  thumb(index: number): Locator {
    return this.thumbs.nth(index);
  }

  async selectSlide(index: number): Promise<void> {
    await this.thumb(index).click();
  }

  /** A row of the run record table, by its label. */
  record(label: string): Locator {
    return this.runRecordRows.filter({ hasText: label }).locator("td").last();
  }

  /** Reference numbers rendered on a bullet, e.g. [1] [2]. */
  bulletRefs(index: number): Locator {
    return this.slideBullets.nth(index).locator("span[style*='nowrap']");
  }
}
