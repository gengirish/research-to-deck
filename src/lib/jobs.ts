import { getPool } from "./db";

export type JobStatus = "queued" | "running" | "done" | "failed";
export type JobStage = "queued" | "searching" | "ingesting" | "retrieving" | "synthesizing" | "rendering" | "done" | "failed";

export interface JobRow {
  id: string;
  topic: string;
  paper_count: number;
  status: JobStatus;
  stage: JobStage;
  progress: number;
  error: string | null;
  stats: Record<string, unknown>;
  deck_name: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function createJob(id: string, topic: string, paperCount: number): Promise<void> {
  await getPool().query(`INSERT INTO jobs (id, topic, paper_count) VALUES ($1, $2, $3)`, [id, topic, paperCount]);
}

export async function getJob(id: string): Promise<JobRow | null> {
  const { rows } = await getPool().query<JobRow>(
    `SELECT id, topic, paper_count, status, stage, progress, error, stats, deck_name, created_at, updated_at FROM jobs WHERE id = $1`,
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

export async function saveDeck(id: string, deck: Buffer, deckName: string): Promise<void> {
  await getPool().query(
    `UPDATE jobs SET deck = $2, deck_name = $3, status = 'done', stage = 'done', progress = 100, updated_at = now() WHERE id = $1`,
    [id, deck, deckName],
  );
}

export async function getDeck(id: string): Promise<{ deck: Buffer; deck_name: string } | null> {
  const { rows } = await getPool().query<{ deck: Buffer; deck_name: string }>(
    `SELECT deck, deck_name FROM jobs WHERE id = $1 AND deck IS NOT NULL`,
    [id],
  );
  return rows[0] ?? null;
}
