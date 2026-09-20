-- Per-job activity log. The pipeline runs in a separate worker process, so the
-- only way the web UI can show what is happening in the background is for the
-- worker to write each step here and the status endpoint to read it back.
CREATE TABLE IF NOT EXISTS job_events (
  id          BIGSERIAL PRIMARY KEY,
  job_id      UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  stage       TEXT NOT NULL,
  level       TEXT NOT NULL DEFAULT 'info',   -- 'info' | 'success' | 'warn' | 'error'
  message     TEXT NOT NULL,
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Polling asks for "everything after id N" for one job; this serves it directly.
CREATE INDEX IF NOT EXISTS job_events_job_id_idx ON job_events (job_id, id);
