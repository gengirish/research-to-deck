import { NextResponse } from "next/server";
import { readSvixHeaders, verifyWebhookSignature } from "@/lib/agentmailWebhook";
import { grantPurchase } from "@/lib/billing";
import { purchaseFromEvent } from "@/lib/dodo";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dodo Payments webhook: grants credits for a succeeded payment. Dodo signs with the
 * Standard Webhooks scheme (webhook-id / webhook-timestamp / webhook-signature), the same
 * HMAC as Svix, so the AgentMail verifier checks it. Deliveries are at least once;
 * `grantPurchase` is keyed on the payment id, so a retry grants nothing. Answers 200 for
 * events it deliberately ignores, 5xx only when a retry could help.
 */
export async function POST(request: Request) {
  const secret = env.dodoWebhookKey;
  if (!secret || !env.dodoApiKey) {
    console.error("[dodo] webhook hit but DODO_PAYMENTS_WEBHOOK_KEY / DODO_PAYMENTS_API_KEY are not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  // The signature covers the exact bytes sent, so the body is read as text first.
  const rawBody = await request.text();
  const verified = verifyWebhookSignature(rawBody, readSvixHeaders(request.headers), secret);
  if (!verified.ok) {
    console.warn(`[dodo] rejected webhook: ${verified.reason}`);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const purchase = purchaseFromEvent(payload);
  if (!purchase) return NextResponse.json({ status: "ignored" });

  try {
    const granted = await grantPurchase(purchase);
    console.log(`[dodo] ${granted ? "granted" : "already granted"} ${purchase.credits} credits for ${purchase.paymentRef}`);
    return NextResponse.json({ status: granted ? "granted" : "duplicate" });
  } catch (err) {
    console.error("[dodo] could not grant credits", err);
    return NextResponse.json({ error: "Could not grant credits" }, { status: 500 });
  }
}
