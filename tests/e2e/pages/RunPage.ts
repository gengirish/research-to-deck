import type { Locator, Page } from "@playwright/test";

/** The progress view: phase list, papers table and activity log. */
export class RunPage {
  readonly heading: Locator;
  readonly runTitle: Locator;
  readonly runSubtitle: Locator;
  readonly meter: Locator;
  readonly meterFill: Locator;
  readonly progressLabel: Locator;
  readonly progressPercent: Locator;
  readonly phases: Locator;
  readonly papersPanel: Locator;
  readonly paperRows: Locator;
  readonly papersCount: Locator;
  readonly log: Locator;
  readonly logLines: Locator;
  readonly error: Locator;
  readonly backButton: Locator;
  readonly retryButton: Locator;
  readonly paperSkeletonRows: Locator;
  readonly elapsed: Locator;

  constructor(readonly page: Page) {
    this.heading = page.locator(".run-head > span").first();
    this.runTitle = page.locator("h1.run-title");
    this.runSubtitle = page.locator("p.run-sub");
    this.meter = page.locator(".meter");
    this.meterFill = page.locator(".meter > div");
    this.progressLabel = page.locator(".meter-legend > span").first();
    this.progressPercent = page.locator(".meter-legend > span").last();
    this.phases = page.locator(".phase");
    this.papersPanel = page.locator(".run-right");
    // Skeleton rows are real <tr>s in the same table — that is what stops the
    // layout moving when data lands — so exclude them from "papers admitted".
    this.paperRows = page.locator(".run-right tbody tr:not(.skel-row)");
    this.paperSkeletonRows = page.locator(".run-right tbody tr.skel-row");
    this.papersCount = page.locator(".run-right .panel-head .meta");
    this.log = page.locator("ol.log");
    this.logLines = page.locator("ol.log li.log-line");
    this.error = page.locator(".run-left .form-error");
    // A failed run adds a primary "Retry this topic" alongside it, so this has to
    // name the secondary button rather than "the button in the left column".
    this.backButton = page.locator(".run-left button.btn-secondary");
    this.retryButton = page.getByRole("button", { name: "Retry this topic" });
    this.elapsed = page.locator(".run-head .job").last();
  }

  /** A phase row by its visible label, e.g. "OpenAlex screening". */
  phase(label: string): Locator {
    return this.phases.filter({ hasText: label });
  }

  /** The headline number a phase reports, e.g. "4 papers". */
  phaseStat(label: string): Locator {
    return this.phase(label).locator(".stat");
  }

  /** Whether a phase is marked done / active / todo / failed. */
  async phaseState(label: string): Promise<string> {
    const cls = (await this.phase(label).getAttribute("class")) ?? "";
    return cls.replace("phase ", "").replace("phase-", "");
  }

  paperRow(titleFragment: string): Locator {
    return this.paperRows.filter({ hasText: titleFragment });
  }

  logLine(fragment: string): Locator {
    return this.logLines.filter({ hasText: fragment });
  }
}
