import { NextResponse } from "next/server";
import { getJob, listJobEvents } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  if (!UUID.test(jobId)) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });

  const job = await getJob(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // `?since=<last event id>` lets the UI poll for only the new activity.
  const since = Number(new URL(request.url).searchParams.get("since") ?? 0);
  const events = await listJobEvents(jobId, Number.isFinite(since) && since > 0 ? since : 0);

  const origin = new URL(request.url).origin;
  return NextResponse.json({
    jobId: job.id,
    topic: job.topic,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    error: job.error,
    stats: job.stats,
    events: events.map((e) => ({
      id: Number(e.id),
      stage: e.stage,
      level: e.level,
      message: e.message,
      detail: e.detail,
      at: e.created_at,
    })),
    downloadUrl: job.status === "done" ? `${origin}/api/decks/${job.id}/download` : null,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  });
}
