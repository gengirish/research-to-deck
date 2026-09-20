-- AgentMail delivery: who to notify when a job finishes, and where to reply
-- when the job was requested over email rather than the HTTP API.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS notify_email     TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS reply_inbox_id   TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS reply_message_id TEXT;
-- Set once the deck (or failure notice) has been emailed, so retries of the
-- same BullMQ job never send twice.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS notified_at      TIMESTAMPTZ;

-- Webhook deliveries are at-least-once; Svix retries reuse the same event id.
CREATE TABLE IF NOT EXISTS inbound_events (
  event_id    TEXT PRIMARY KEY,
  job_id      UUID REFERENCES jobs(id) ON DELETE SET NULL,
  from_email  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
