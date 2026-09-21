import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { parseAddress, parseDeckRequest, parseWebhookEvent, readSvixHeaders, verifyWebhookSignature } from "@/lib/agentmailWebhook";
import { canUseCustomBrand, createPaidJob, getAccount, isBillingEnabled, refundJob } from "@/lib/billing";
import { hasBrand } from "@/lib/brand";
import { findUserIdByEmail } from "@/lib/clerkUsers";
import { isEmailEnabled, replyAccepted, replyRejected } from "@/lib/email";
import { env } from "@/lib/env";
import { attachInboundEventJob, claimInboundEvent, createJob, releaseInboundEvent, updateJob } from "@/lib/jobs";
import { getDeckQueue } from "@/lib/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Inbound AgentMail webhook: turns a received email into a deck job and replies
 * in-thread. Returns 200 for anything we deliberately skip so Svix stops
 * retrying, and 5xx only when a retry could actually succeed.
 */
export async function POST(request: Request) {
  const secret = env.agentMailWebhookSecret;
  if (!secret || !isEmailEnabled()) {
    console.error("[agentmail] webhook hit but AGENTMAIL_WEBHOOK_SECRET / AGENTMAIL_API_KEY are not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  // Signature covers the exact bytes sent, so the body is read as text first.
  const rawBody = await request.text();
  const verified = verifyWebhookSignature(rawBody, readSvixHeaders(request.headers), secret);
  if (!verified.ok) {
    console.warn(`[agentmail] rejected webhook: ${verified.reason}`);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const event = parseWebhookEvent(payload);
  if (event.kind === "invalid") return NextResponse.json({ error: event.reason }, { status: 400 });
  if (event.kind === "ignored") return NextResponse.json({ status: "ignored", reason: event.reason });

  const { eventId, message } = event;
  const sender = parseAddress(message.from);
  if (!sender) return NextResponse.json({ status: "ignored", reason: "Unparseable sender" });
  // Our own outbound mail must never start another job.
  if (sender === message.inbox_id.toLowerCase()) {
    return NextResponse.json({ status: "ignored", reason: "Self-addressed" });
  }

  // Claimed before any work so Svix retries cannot queue a second deck.
  if (!(await claimInboundEvent(eventId, sender))) {
    return NextResponse.json({ status: "duplicate", eventId });
  }

  try {
    const parsed = parseDeckRequest(message);
    if (!parsed.ok) {
      await replyRejected(message.inbox_id, message.message_id, parsed.reason);
      return NextResponse.json({ status: "rejected", reason: parsed.reason });
    }

    const { topic, paperCount } = parsed.request;
    const jobId = randomUUID();
    // The job stays ownerless (no userId) so the emailed download link keeps working;
    // with billing on it is still paid for, by the account that owns the sender address.
    const delivery = { notifyEmail: sender, replyInboxId: message.inbox_id, replyMessageId: message.message_id };
    if (isBillingEnabled()) {
      const payer = await findUserIdByEmail(sender);
      if (!payer) {
        const reason = `decks by email need an account with credits. Sign up at ${env.appBaseUrl} with this address, then email again`;
        await replyRejected(message.inbox_id, message.message_id, reason);
        return NextResponse.json({ status: "rejected", reason: "No account for sender" });
      }
      const brandUserId = canUseCustomBrand(await getAccount(payer)) && (await hasBrand(payer)) ? payer : undefined;
      if (!(await createPaidJob(payer, jobId, topic, paperCount, { ...delivery, brandUserId }))) {
        await replyRejected(message.inbox_id, message.message_id, `your account is out of credits. Buy more at ${env.appBaseUrl}/billing`);
        return NextResponse.json({ status: "rejected", reason: "Out of credits" });
      }
    } else {
      await createJob(jobId, topic, paperCount, delivery);
    }
    await attachInboundEventJob(eventId, jobId);

    try {
      await getDeckQueue().add("deck", { jobId }, { jobId, attempts: 1, removeOnComplete: 200, removeOnFail: 500 });
    } catch (err) {
      await updateJob(jobId, { status: "failed", stage: "failed", error: "Could not enqueue job" });
      await refundJob(jobId).catch((e) => console.error("[agentmail] refund failed", e));
      console.error("[agentmail] enqueue failed", err);
      await replyRejected(message.inbox_id, message.message_id, "our queue is temporarily unavailable — please resend shortly");
      return NextResponse.json({ status: "rejected", reason: "Queue unavailable" });
    }

    await replyAccepted(message.inbox_id, message.message_id, { topic, paperCount, jobId });
    console.log(`[agentmail] queued job ${jobId.slice(0, 8)} from ${sender}`);
    return NextResponse.json({ status: "queued", jobId });
  } catch (err) {
    // Free the claim so the Svix retry gets a real second attempt.
    await releaseInboundEvent(eventId).catch(() => {});
    console.error("[agentmail] webhook handler failed", err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
