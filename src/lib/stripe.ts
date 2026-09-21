import Stripe from "stripe";
import type { CreditPack, Purchase } from "./billing";
import { env } from "./env";

// App-only: the worker never imports this module, so it never needs the Stripe key.

const globalForStripe = globalThis as unknown as { stripe?: Stripe };

export function getStripe(): Stripe {
  const key = env.stripeSecretKey;
  if (!key) throw new Error("Missing required environment variable: STRIPE_SECRET_KEY");
  if (!globalForStripe.stripe) globalForStripe.stripe = new Stripe(key);
  return globalForStripe.stripe;
}

/**
 * Checkout parameters for one credit pack. The price is inline (`price_data`), so the
 * Stripe account needs no products set up; `CREDIT_PACKS` is the only price list.
 * Metadata carries what the webhook needs to grant the credits, and only this server
 * can create a session, so the webhook can trust it.
 */
export function checkoutParams(pack: CreditPack, userId: string, origin: string): Stripe.Checkout.SessionCreateParams {
  return {
    mode: "payment",
    client_reference_id: userId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: pack.amountCents,
          product_data: {
            name: `Research-to-Deck · ${pack.label}`,
            description: `${pack.credits} cited deck ${pack.credits === 1 ? "run" : "runs"}. Unlocks custom deck branding.`,
          },
        },
      },
    ],
    metadata: { user_id: userId, pack_id: pack.id, credits: String(pack.credits) },
    success_url: `${origin}/billing?checkout=success`,
    cancel_url: `${origin}/billing?checkout=cancelled`,
  };
}

/**
 * The purchase a completed Checkout session represents, or null when it grants
 * nothing: not paid yet (an async method still settling), or not one of ours.
 */
export function purchaseFromSession(session: Stripe.Checkout.Session): Purchase | null {
  if (session.payment_status !== "paid") return null;
  const userId = session.metadata?.user_id;
  const credits = Number(session.metadata?.credits);
  if (!userId || !Number.isInteger(credits) || credits < 1) return null;
  return { sessionId: session.id, userId, credits, amountCents: session.amount_total ?? 0 };
}
