import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
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
  await createJob(jobId, topic, paperCount, { notifyEmail: email });
  try {
    await getDeckQueue().add("deck", { jobId }, { jobId, attempts: 1, removeOnComplete: 200, removeOnFail: 500 });
    await logJobEvent(jobId, "queued", "Request accepted and queued for a worker", { detail: { topic, paperCount } });
  } catch (err) {
    await updateJob(jobId, { status: "failed", stage: "failed", error: "Could not enqueue job" });
    await logJobEvent(jobId, "failed", "Could not reach the job queue", { level: "error" });
    console.error("enqueue failed", err);
    return NextResponse.json({ error: "Queue unavailable, try again shortly" }, { status: 503 });
  }

  const origin = new URL(request.url).origin;
  return NextResponse.json({ jobId, statusUrl: `${origin}/api/decks/${jobId}`, notifyEmail: email ?? null }, { status: 202 });
}
