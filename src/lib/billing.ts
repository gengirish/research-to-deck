import { withTransaction, type Queryable } from "./db";
import { env } from "./env";
import { createJob, type JobDelivery } from "./jobs";

/**
 * Credits: one credit buys one deck run. Billing is enforced only when
 * DODO_PAYMENTS_API_KEY is set; without it every run is free and unlimited, which is
 * how local development and the existing deployment keep working unchanged.
 */
export function isBillingEnabled(): boolean {
  return Boolean(env.dodoApiKey);
}

/** Credits every new account starts with, so the first deck needs no card. */
export const FREE_CREDITS = 1;

export interface CreditPack {
  id: string;
  label: string;
  credits: number;
  /** USD cents, before any sales tax Dodo adds for the buyer's country. */
  amountCents: number;
}

/**
 * The whole price list. Each pack is also a one-time product in the Dodo dashboard
 * (see PACK_PRODUCT_ENV in src/lib/dodo.ts); change a price in both places.
 */
export const CREDIT_PACKS: readonly CreditPack[] = [
  { id: "single", label: "1 deck", credits: 1, amountCents: 1500 },
  { id: "starter", label: "5 decks", credits: 5, amountCents: 4900 },
  { id: "pro", label: "20 decks", credits: 20, amountCents: 14900 },
];

export function findPack(id: unknown): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.id === id);
}

export interface Account {
  balance: number;
  /** Has completed at least one purchase. Unlocks custom branding. */
  paid: boolean;
}

/**
 * Whether this account may render decks with its own brand. Branding is the paid
 * feature, so it needs a completed purchase; with billing off everyone has it.
 */
export function canUseCustomBrand(account: Account | null, billingEnabled = isBillingEnabled()): boolean {
  return !billingEnabled || account?.paid === true;
}

/** Creates the account on first touch, granting the free credits exactly once. */
async function ensureAccount(db: Queryable, userId: string): Promise<void> {
  const { rowCount } = await db.query(
    `INSERT INTO billing_accounts (user_id, balance) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
    [userId, FREE_CREDITS],
  );
  if (rowCount === 1 && FREE_CREDITS > 0) {
    await db.query(`INSERT INTO credit_ledger (user_id, delta, reason) VALUES ($1, $2, 'free_grant')`, [userId, FREE_CREDITS]);
  }
}

export async function getAccount(userId: string): Promise<Account> {
  return withTransaction(async (client) => {
    await ensureAccount(client, userId);
    const { rows } = await client.query<{ balance: number; paid_at: Date | null }>(
      `SELECT balance, paid_at FROM billing_accounts WHERE user_id = $1`,
      [userId],
    );
    return { balance: rows[0].balance, paid: rows[0].paid_at !== null };
  });
}

/**
 * Creates a job and spends one of `payer`'s credits for it in the same transaction,
 * so a run is never queued unpaid and a credit is never spent without a run. Returns
 * false, creating nothing, when the balance is empty.
 */
export async function createPaidJob(
  payer: string,
  id: string,
  topic: string,
  paperCount: number,
  delivery: JobDelivery = {},
): Promise<boolean> {
  return withTransaction(async (client) => {
    await ensureAccount(client, payer);
    const { rowCount } = await client.query(
      `UPDATE billing_accounts SET balance = balance - 1, updated_at = now() WHERE user_id = $1 AND balance >= 1`,
      [payer],
    );
    if (rowCount !== 1) return false;
    await createJob(id, topic, paperCount, { ...delivery, chargedTo: payer }, client);
    await client.query(`INSERT INTO credit_ledger (user_id, delta, reason, job_id) VALUES ($1, -1, 'deck', $2)`, [payer, id]);
    return true;
  });
}

/**
 * Returns the credit a failed job spent. Safe to call for any job and any number of
 * times: only a charged job is refunded, and `credit_refunded_at` makes it once.
 */
export async function refundJob(jobId: string): Promise<boolean> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{ charged_to: string }>(
      `UPDATE jobs SET credit_refunded_at = now()
        WHERE id = $1 AND charged_to IS NOT NULL AND credit_refunded_at IS NULL
        RETURNING charged_to`,
      [jobId],
    );
    const payer = rows[0]?.charged_to;
    if (!payer) return false;
    await client.query(`UPDATE billing_accounts SET balance = balance + 1, updated_at = now() WHERE user_id = $1`, [payer]);
    await client.query(`INSERT INTO credit_ledger (user_id, delta, reason, job_id) VALUES ($1, 1, 'refund', $2)`, [payer, jobId]);
    return true;
  });
}

export interface Purchase {
  /** The payment provider's id for this payment; granting is idempotent on it. */
  paymentRef: string;
  userId: string;
  credits: number;
  amountCents: number;
}

/**
 * Credits a completed payment. Webhooks are delivered at least once, so the ledger's
 * unique `payment_ref` decides: a redelivery inserts nothing and grants nothing.
 * Returns whether this call did the grant.
 */
export async function grantPurchase(p: Purchase): Promise<boolean> {
  return withTransaction(async (client) => {
    await ensureAccount(client, p.userId);
    const { rowCount } = await client.query(
      `INSERT INTO credit_ledger (user_id, delta, reason, payment_ref, amount_cents)
       VALUES ($1, $2, 'purchase', $3, $4) ON CONFLICT (payment_ref) DO NOTHING`,
      [p.userId, p.credits, p.paymentRef, p.amountCents],
    );
    if (rowCount !== 1) return false;
    await client.query(
      `UPDATE billing_accounts SET balance = balance + $2, paid_at = COALESCE(paid_at, now()), updated_at = now()
        WHERE user_id = $1`,
      [p.userId, p.credits],
    );
    return true;
  });
}
