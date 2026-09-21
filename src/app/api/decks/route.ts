import { randomUUID } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { canUseCustomBrand, createPaidJob, getAccount, isBillingEnabled, refundJob } from "@/lib/billing";
import { hasBrand } from "@/lib/brand";
import { isEmailEnabled } from "@/lib/email";
import { createJob, logJobEvent, updateJob } from "@/lib/jobs";
import { getDeckQueue } from "@/lib/queue";

export const runtime = "nodejs";

const CreateDeckSchema = z.object({
  topic: z.string().trim().min(3).max(300),
  paperCount: z.number().int().min(10).max(100).default(50),
  /** Optional: AgentMail emails the finished deck here instead of you polling. */
  email: z.email().max(320).optional(),
});

export async function POST(request: Request) {
  // A run reads up to 100 papers and bills Claude + Voyage usage, so it needs a session.
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to generate a deck" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const parsed = CreateDeckSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: z.flattenError(parsed.error).fieldErrors }, { status: 400 });
  }

  const { topic, paperCount, email } = parsed.data;
  if (email && !isEmailEnabled()) {
    return NextResponse.json({ error: "Email delivery is not configured on this deployment" }, { status: 400 });
  }

  const jobId = randomUUID();
  const billing = isBillingEnabled();
  const account = billing ? await getAccount(userId) : null;
  // The brand is fixed now, so a purchase or brand edit mid-run cannot change the deck.
  const brandUserId = canUseCustomBrand(account, billing) && (await hasBrand(userId)) ? userId : undefined;
  const delivery = { userId, notifyEmail: email, brandUserId };

  if (billing) {
    // Spends the credit and creates the job in one transaction, or does neither.
    if (!(await createPaidJob(userId, jobId, topic, paperCount, delivery))) {
      return NextResponse.json({ error: "You're out of credits. Buy more to start a run.", balance: 0, billingUrl: "/billing" }, { status: 402 });
    }
  } else {
    await createJob(jobId, topic, paperCount, delivery);
  }
  try {
    await getDeckQueue().add("deck", { jobId }, { jobId, attempts: 1, removeOnComplete: 200, removeOnFail: 500 });
    await logJobEvent(jobId, "queued", "Request accepted and queued for a worker", { detail: { topic, paperCount } });
  } catch (err) {
    await updateJob(jobId, { status: "failed", stage: "failed", error: "Could not enqueue job" });
    await logJobEvent(jobId, "failed", "Could not reach the job queue", { level: "error" });
    await refundJob(jobId).catch((e) => console.error("refund failed", e));
    console.error("enqueue failed", err);
    return NextResponse.json({ error: "Queue unavailable, try again shortly" }, { status: 503 });
  }

  const origin = new URL(request.url).origin;
  return NextResponse.json({ jobId, statusUrl: `${origin}/api/decks/${jobId}`, notifyEmail: email ?? null }, { status: 202 });
}
