-- Credits: one credit buys one deck. Billing is only enforced when STRIPE_SECRET_KEY is
-- set on the app (see src/lib/billing.ts); without it these tables stay empty.

-- One row per Clerk user. `balance` is the source of truth for spending, debited with a
-- conditional UPDATE so two concurrent runs can never overdraw it.
CREATE TABLE IF NOT EXISTS billing_accounts (
  user_id     TEXT PRIMARY KEY,
  balance     INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  -- First completed purchase. Custom branding is unlocked from then on.
  paid_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only audit trail of every balance change: the free grant, purchases, deck runs
-- and refunds. `stripe_session_id` is unique so a redelivered Checkout webhook cannot
-- grant the same pack twice.
CREATE TABLE IF NOT EXISTS credit_ledger (
  id                 BIGSERIAL PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES billing_accounts(user_id) ON DELETE CASCADE,
  delta              INTEGER NOT NULL,
  reason             TEXT NOT NULL,      -- free_grant | purchase | deck | refund
  job_id             UUID REFERENCES jobs(id) ON DELETE SET NULL,
  stripe_session_id  TEXT UNIQUE,
  amount_cents       INTEGER,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credit_ledger_user_idx ON credit_ledger (user_id, created_at DESC);

-- Who paid for a job. Separate from `user_id` (ownership) because an email-originated job
-- is charged to the sender's account but must stay ownerless so its emailed link works.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS charged_to         TEXT;
-- Set once the credit for a failed job has been returned, so a refund happens at most once.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS credit_refunded_at TIMESTAMPTZ;
-- Whose saved brand the renderer applies. NULL renders with the default python/brand.json.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS brand_user_id      TEXT;

-- A paying account's deck branding. Colors are 6-digit hex without '#', matching brand.json.
CREATE TABLE IF NOT EXISTS brands (
  user_id     TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  footer      TEXT NOT NULL,
  primary_color TEXT NOT NULL,
  accent_color  TEXT NOT NULL,
  dark_color    TEXT NOT NULL,
  logo        BYTEA,
  logo_type   TEXT,                      -- image/png | image/jpeg
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
