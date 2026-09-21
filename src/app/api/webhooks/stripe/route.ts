import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { grantPurchase } from "@/lib/billing";
import { env } from "@/lib/env";
import { getStripe, purchaseFromSession } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook: grants credits for a completed Checkout session. Deliveries are at
 * least once; `grantPurchase` is keyed on the session id, so a retry grants nothing.
 * Answers 200 for events it deliberately ignores, 5xx only when a retry could help.
 */
export async function POST(request: Request) {
  const secret = env.stripeWebhookSecret;
  if (!secret || !env.stripeSecretKey) {
    console.error("[stripe] webhook hit but STRIPE_WEBHOOK_SECRET / STRIPE_SECRET_KEY are not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  // The signature covers the exact bytes sent, so the body is read as text first.
  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, request.headers.get("stripe-signature") ?? "", secret);
  } catch (err) {
    console.warn(`[stripe] rejected webhook: ${err instanceof Error ? err.message : err}`);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // `async_payment_succeeded` covers payment methods that settle after the session completes.
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return NextResponse.json({ status: "ignored", type: event.type });
  }

  const purchase = purchaseFromSession(event.data.object);
  if (!purchase) return NextResponse.json({ status: "ignored", reason: "Not paid, or not a credit purchase" });

  try {
    const granted = await grantPurchase(purchase);
    console.log(`[stripe] ${granted ? "granted" : "already granted"} ${purchase.credits} credits for ${purchase.sessionId}`);
    return NextResponse.json({ status: granted ? "granted" : "duplicate" });
  } catch (err) {
    console.error("[stripe] could not grant credits", err);
    return NextResponse.json({ error: "Could not grant credits" }, { status: 500 });
  }
}
