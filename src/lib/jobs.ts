import { getPool } from "./db";

export type JobStatus = "queued" | "running" | "done" | "failed";
export type JobStage = "queued" | "searching" | "ingesting" | "retrieving" | "synthesizing" | "rendering" | "done" | "failed";

export interface JobRow {
  id: string;
  user_id: string | null;
  topic: string;
  paper_count: number;
  status: JobStatus;
  stage: JobStage;
  progress: number;
  error: string | null;
  stats: Record<string, unknown>;
  deck_name: string | null;
  notify_email: string | null;
  reply_inbox_id: string | null;
  reply_message_id: string | null;
  notified_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** Where to send the finished deck. Absent for API callers who just poll the status endpoint. */
export interface JobDelivery {
  /** Clerk user id of whoever started the run. Omitted for email-originated jobs. */
  userId?: string;
  notifyEmail?: string;
  /** Set when the job arrived over email, so the deck goes back as an in-thread reply. */
  replyInboxId?: string;
  replyMessageId?: string;
}

export async function createJob(id: string, topic: string, paperCount: number, delivery: JobDelivery = {}): Promise<void> {
  await getPool().query(
    `INSERT INTO jobs (id, user_id, topic, paper_count, notify_email, reply_inbox_id, reply_message_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, delivery.userId ?? null, topic, paperCount, delivery.notifyEmail ?? null, delivery.replyInboxId ?? null, delivery.replyMessageId ?? null],
  );
}

/**
 * Whether `userId` (null when signed out) may read this job.
 *
 * An ownerless job — one that arrived by email, or predates auth — is guarded only by
 * its UUID, because the emailed download link carries no session. An owned job is
 * private to its owner. Callers answer a refusal with 404, not 403, so the endpoint
 * does not confirm that someone else's job id exists.
 */
export function canAccessJob(job: Pick<JobRow, "user_id">, userId: string | null): boolean {
  return job.user_id === null || job.user_id === userId;
}

export async function getJob(id: string): Promise<JobRow | null> {
  const { rows } = await getPool().query<JobRow>(
    `SELECT id, user_id, topic, paper_count, status, stage, progress, error, stats, deck_name,
            notify_email, reply_inbox_id, reply_message_id, notified_at, created_at, updated_at
       FROM jobs WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function updateJob(
  id: string,
  patch: { status?: JobStatus; stage?: JobStage; progress?: number; error?: string | null; stats?: Record<string, unknown> },
): Promise<void> {
  await getPool().query(
    `UPDATE jobs SET
       status = COALESCE($2, status),
       stage = COALESCE($3, stage),
       progress = COALESCE($4, progress),
       error = CASE WHEN $5::boolean THEN $6 ELSE error END,
       stats = stats || COALESCE($7::jsonb, '{}'::jsonb),
       updated_at = now()
     WHERE id = $1`,
    [id, patch.status ?? null, patch.stage ?? null, patch.progress ?? null, "error" in patch, patch.error ?? null, patch.stats ? JSON.stringify(patch.stats) : null],
  );
}

/** Stores the finished deck: the .pptx for download, and its content for the UI to render. */
export async function saveDeck(id: string, deck: Buffer, deckName: string, deckJson: unknown): Promise<void> {
  await getPool().query(
    `UPDATE jobs SET deck = $2, deck_name = $3, deck_json = $4::jsonb,
            status = 'done', stage = 'done', progress = 100, updated_at = now()
      WHERE id = $1`,
    [id, deck, deckName, JSON.stringify(deckJson)],
  );
}

/** The render-ready deck, for the result view. Null until the job finishes. */
export async function getDeckJson(id: string): Promise<unknown | null> {
  const { rows } = await getPool().query<{ deck_json: unknown }>(`SELECT deck_json FROM jobs WHERE id = $1`, [id]);
  return rows[0]?.deck_json ?? null;
}

export async function getDeck(id: string): Promise<{ deck: Buffer; deck_name: string } | null> {
  const { rows } = await getPool().query<{ deck: Buffer; deck_name: string }>(
    `SELECT deck, deck_name FROM jobs WHERE id = $1 AND deck IS NOT NULL`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Atomically claims the right to send this job's one notification email.
 * Returns false when another attempt already claimed it, which keeps BullMQ
 * retries and the worker's `failed` handler from emailing the same job twice.
 */
export async function claimNotification(id: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    `UPDATE jobs SET notified_at = now() WHERE id = $1 AND notified_at IS NULL`,
    [id],
  );
  return rowCount === 1;
}

/** Releases a claim so a later attempt can retry the email after a send failure. */
export async function releaseNotification(id: string): Promise<void> {
  await getPool().query(`UPDATE jobs SET notified_at = NULL WHERE id = $1`, [id]);
}

/**
 * Claims an inbound webhook event before any work is done for it. Returns false
 * when this event id was already claimed — Svix redelivers the same id on retry,
 * and claiming first is what stops one email from queueing two decks.
 */
export async function claimInboundEvent(eventId: string, fromEmail: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    `INSERT INTO inbound_events (event_id, from_email) VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING`,
    [eventId, fromEmail],
  );
  return rowCount === 1;
}

/** Links a claimed inbound event to the job it produced, for tracing. */
export async function attachInboundEventJob(eventId: string, jobId: string): Promise<void> {
  await getPool().query(`UPDATE inbound_events SET job_id = $2 WHERE event_id = $1`, [eventId, jobId]);
}

/** Frees a claim so a Svix retry can be processed after a mid-handler failure. */
export async function releaseInboundEvent(eventId: string): Promise<void> {
  await getPool().query(`DELETE FROM inbound_events WHERE event_id = $1`, [eventId]);
}

export type JobEventLevel = "info" | "success" | "warn" | "error";

export interface JobEventRow {
  id: string;
  stage: string;
  level: JobEventLevel;
  message: string;
  detail: Record<string, unknown> | null;
  created_at: Date;
}

/**
 * Appends one line to a job's activity log. Telemetry must never be the reason a
 * deck fails, so a write error is logged and swallowed rather than thrown.
 */
export async function logJobEvent(
  id: string,
  stage: JobStage,
  message: string,
  { level = "info", detail }: { level?: JobEventLevel; detail?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    await getPool().query(
      `INSERT INTO job_events (job_id, stage, level, message, detail) VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [id, stage, level, message.slice(0, 500), detail ? JSON.stringify(detail) : null],
    );
  } catch (err) {
    console.error(`[job ${id.slice(0, 8)}] could not record event "${message}":`, err);
  }
}

/**
 * Events for a job, oldest first. `afterId` makes polling incremental.
 * Degrades to an empty log rather than breaking the status endpoint, so a deploy
 * that lands before `003_job_events.sql` still reports stage and progress.
 */
export async function listJobEvents(id: string, afterId = 0, limit = 500): Promise<JobEventRow[]> {
  try {
    const { rows } = await getPool().query<JobEventRow>(
      `SELECT id, stage, level, message, detail, created_at
         FROM job_events WHERE job_id = $1 AND id > $2
        ORDER BY id ASC LIMIT $3`,
      [id, afterId, limit],
    );
    return rows;
  } catch (err) {
    console.error(`[job ${id.slice(0, 8)}] could not read events:`, err);
    return [];
  }
}
