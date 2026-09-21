-- Billing moved from Stripe to Dodo Payments (Stripe onboarding is invite-only for Indian
-- businesses). The ledger's idempotency key now holds the provider's payment id, so the
-- column gets a provider-neutral name. Guarded so re-running the migrations is a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'credit_ledger' AND column_name = 'stripe_session_id'
  ) THEN
    ALTER TABLE credit_ledger RENAME COLUMN stripe_session_id TO payment_ref;
  END IF;
END $$;
