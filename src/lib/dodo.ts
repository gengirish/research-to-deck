import { z } from "zod";
import type { CreditPack, Purchase } from "./billing";
import { env } from "./env";
import { fetchWithRetry, HttpError } from "./http";

// App-only: the worker never imports this module, so it never needs the Dodo key.
//
// Dodo Payments is the merchant of record: it charges the buyer, adds and remits sales
// tax / VAT for their country, and pays out to an Indian bank account. Called over
// plain HTTP rather than through its SDK, since checkout creation is the only call.

const BASE_URLS = { test_mode: "https://test.dodopayments.com", live_mode: "https://live.dodopayments.com" } as const;

/**
 * The Dodo product behind each pack. Dodo prices live on products created in its
 * dashboard (there is no inline pricing), so each pack names one by env var, and the
 * product's price must match the pack's `amountCents`.
 */
export const PACK_PRODUCT_ENV: Record<string, string> = {
  single: "DODO_PRODUCT_SINGLE",
  starter: "DODO_PRODUCT_STARTER",
  pro: "DODO_PRODUCT_PRO",
};

export function productIdFor(pack: CreditPack): string {
  const name = PACK_PRODUCT_ENV[pack.id];
  const id = name ? process.env[name] : undefined;
  if (!id) throw new Error(`Missing required environment variable: ${name ?? `product for pack "${pack.id}"`}`);
  return id;
}

/**
 * The checkout-session body for one pack. `metadata` is copied onto the resulting
 * payment, and only this server (holding the API key) can create a session, so the
 * webhook can trust the user id and credit count it carries.
 */
export function checkoutBody(pack: CreditPack, productId: string, userId: string, origin: string) {
  return {
    product_cart: [{ product_id: productId, quantity: 1 }],
    metadata: { user_id: userId, pack_id: pack.id, credits: String(pack.credits) },
    return_url: `${origin}/billing?checkout=success`,
    cancel_url: `${origin}/billing?checkout=cancelled`,
  };
}

/** Creates a hosted checkout session and returns the URL to send the buyer to. */
export async function createCheckout(pack: CreditPack, userId: string, origin: string): Promise<string> {
  const apiKey = env.dodoApiKey;
  if (!apiKey) throw new Error("Missing required environment variable: DODO_PAYMENTS_API_KEY");
  // Someone is waiting on the Buy button, so retry briefly rather than the default five times.
  const res = await fetchWithRetry(
    `${BASE_URLS[env.dodoEnvironment]}/checkouts`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(checkoutBody(pack, productIdFor(pack), userId, origin)),
    },
    { retries: 2, timeoutMs: 15_000 },
  );
  if (!res.ok) throw new HttpError(`Dodo Payments checkout failed: ${res.status} ${(await res.text()).slice(0, 300)}`, res.status);
  const { checkout_url } = (await res.json()) as { checkout_url?: string | null };
  if (!checkout_url) throw new Error("Dodo Payments returned no checkout_url");
  return checkout_url;
}

const PaymentEventSchema = z.object({
  type: z.string(),
  data: z
    .object({
      payment_id: z.string(),
      total_amount: z.number().optional(),
      metadata: z.record(z.string(), z.unknown()).nullish(),
    })
    .passthrough(),
});

/**
 * The purchase a webhook event represents, or null when it grants nothing: any event
 * other than `payment.succeeded`, or a payment that is not one of our credit packs.
 */
export function purchaseFromEvent(payload: unknown): Purchase | null {
  const parsed = PaymentEventSchema.safeParse(payload);
  if (!parsed.success || parsed.data.type !== "payment.succeeded") return null;
  const { payment_id, total_amount, metadata } = parsed.data.data;
  const userId = metadata?.user_id;
  const credits = Number(metadata?.credits);
  if (typeof userId !== "string" || !userId || !Number.isInteger(credits) || credits < 1) return null;
  return { paymentRef: payment_id, userId, credits, amountCents: total_amount ?? 0 };
}
