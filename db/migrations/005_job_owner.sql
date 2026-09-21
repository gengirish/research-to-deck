-- Clerk user that started the run. NULL means an ownerless job: one that arrived by
-- email through the AgentMail webhook, or one created before auth existed. Ownerless
-- jobs stay readable by whoever holds the job UUID, which is how the email reply and
-- the documented polling API keep working; owned jobs are readable only by their owner
-- (see `canAccessJob` in src/lib/jobs.ts).
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS user_id TEXT;

-- Supports "my recent runs" reads; the primary key already covers single-job lookups.
CREATE INDEX IF NOT EXISTS jobs_user_id_created_at_idx ON jobs (user_id, created_at DESC);
