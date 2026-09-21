/**
 * A controllable stand-in for the deck API, installed with `page.route`.
 *
 * The app's own routes stay untouched — this intercepts the browser's calls to
 * them so a journey spec can walk a run from "queued" to "done" in seconds with
 * no worker, no Postgres, no Redis and no model spend. `advance()` moves the run
 * one stage on; the page's own 1.5s poll picks the change up, and Playwright's
 * auto-retrying assertions absorb the delay.
 *
 * Faithfulness to the real route is the point: `since` filtering, the 202 on
 * create, and the payload shape all mirror `src/app/api/decks/`. Where they drift,
 * these specs pass while production breaks, so keep them together.
 */

import type { Page, Route } from "@playwright/test";
import type { JobEvent, JobStatus } from "../../../src/components/deck";
import { JOB_ID, TIMELINE } from "./deckData";

/** Stand-in for the rendered .pptx — the download route streams bytes, not a file. */
const DECK_BYTES = Buffer.from("PKe2e-deck-fixture");

export interface CreateFailure {
  status: number;
  body: Record<string, unknown>;
}

export class DeckApiMock {
  /** Index into the timeline the next status poll will answer with. */
  private step = 0;
  private timeline: JobStatus[];
  /** Set to make `POST /api/decks` fail instead of accepting the run. */
  private createFailure: CreateFailure | null = null;
  /** Every create body the app sent, so specs can assert what the form submitted. */
  readonly createRequests: Record<string, unknown>[] = [];
  /** Resolves once the download route has been hit. */
  downloadCount = 0;
  /** While true, status polls answer 503 — the app should say so and keep retrying. */
  private pollFailing = false;
  /**
   * Held back on every status poll. The real gap between "202 accepted" and the
   * first answer is a network round trip plus the worker picking the job up, and
   * the hand-off view only exists to fill it — so a spec has to be able to widen
   * it rather than race a mock that answers instantly.
   */
  private statusDelayMs = 0;

  constructor(
    private readonly page: Page,
    timeline: JobStatus[] = TIMELINE,
  ) {
    this.timeline = timeline;
  }

  /** Swap the timeline — used by the failure spec. */
  useTimeline(timeline: JobStatus[]): void {
    this.timeline = timeline;
    this.step = 0;
  }

  /** Pass `null` to go back to accepting runs. */
  failCreate(failure: CreateFailure | null): void {
    this.createFailure = failure;
  }

  /**
   * Make status polls fail. The run itself is untouched: this is the network
   * between the browser and a job that is still progressing on the worker.
   */
  breakPolling(): void {
    this.pollFailing = true;
  }

  restorePolling(): void {
    this.pollFailing = false;
  }

  /** Stall every status poll by `ms`, so the hand-off state is observable. */
  delayStatus(ms: number): void {
    this.statusDelayMs = ms;
  }

  /** Back to the start of the timeline, for a spec that re-runs the same topic. */
  rewind(): void {
    this.step = 0;
  }

  /** Move the run on one stage. Stops at the end of the timeline. */
  advance(by = 1): void {
    this.step = Math.min(this.step + by, this.timeline.length - 1);
  }

  /** Jump straight to the terminal state, for specs that only care about the result. */
  finish(): void {
    this.step = this.timeline.length - 1;
  }

  get stage(): string {
    return this.timeline[this.step].stage;
  }

  async install(): Promise<void> {
    await this.page.route("**/api/decks", (route) => this.handleCreate(route));
    await this.page.route("**/api/decks/*/download", (route) => this.handleDownload(route));
    await this.page.route("**/api/decks/*", (route) => this.handleStatus(route));
  }

  private async handleCreate(route: Route): Promise<void> {
    if (route.request().method() !== "POST") return route.fallback();

    const body = route.request().postDataJSON() as Record<string, unknown>;
    this.createRequests.push(body);

    if (this.createFailure) {
      return route.fulfill({
        status: this.createFailure.status,
        contentType: "application/json",
        body: JSON.stringify(this.createFailure.body),
      });
    }

    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ jobId: JOB_ID, statusUrl: `/api/decks/${JOB_ID}`, notifyEmail: body.email ?? null }),
    });
  }

  private async handleStatus(route: Route): Promise<void> {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/download")) return route.fallback();

    if (this.statusDelayMs) await new Promise((r) => setTimeout(r, this.statusDelayMs));

    if (this.pollFailing) {
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "upstream unavailable" }),
      });
    }

    const since = Number(url.searchParams.get("since") ?? 0);
    const current = this.timeline[this.step];

    // Same rule as the real route: every event so far whose id the client has not
    // seen, not just the ones this stage produced.
    const events: JobEvent[] = this.timeline
      .slice(0, this.step + 1)
      .flatMap((s) => s.events)
      .filter((e) => e.id > since);

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...current, events }),
    });
  }

  private async handleDownload(route: Route): Promise<void> {
    this.downloadCount++;
    await route.fulfill({
      status: 200,
      contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      headers: { "Content-Disposition": 'attachment; filename="research-to-deck.pptx"' },
      body: DECK_BYTES,
    });
  }
}
