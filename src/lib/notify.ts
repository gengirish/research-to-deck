import { isEmailEnabled, sendDeckFailed, sendDeckReady, wantsEmail } from "./email";
import { claimNotification, getJob, releaseNotification, type JobRow } from "./jobs";

/**
 * Email notification for finished jobs.
 *
 * Delivery is best-effort on purpose: a deck that rendered is still a success
 * even if AgentMail is down, and it stays downloadable from the status URL.
 * Each job emails at most once, claimed in Postgres so a BullMQ retry and the
 * worker's `failed` handler cannot both fire.
 */

async function notify(job: JobRow, send: () => Promise<void>): Promise<void> {
  if (!isEmailEnabled() || !wantsEmail(job)) return;
  if (!(await claimNotification(job.id))) return;
  try {
    await send();
  } catch (err) {
    console.error(`[email] could not notify for job ${job.id.slice(0, 8)}:`, err);
    // Give a later attempt a chance rather than silently swallowing the deck.
    await releaseNotification(job.id).catch(() => {});
  }
}

export async function notifyDeckReady(
  job: JobRow,
  deck: Buffer,
  deckName: string,
  facts: { slides: number; references: number; papers: number },
): Promise<void> {
  await notify(job, () => sendDeckReady(job, deck, deckName, facts));
}

/** Looks the job up itself, since the worker's failure handler only has an id. */
export async function notifyDeckFailed(jobId: string, error: string): Promise<void> {
  const job = await getJob(jobId).catch(() => null);
  if (!job) return;
  await notify(job, () => sendDeckFailed(job, error));
}
