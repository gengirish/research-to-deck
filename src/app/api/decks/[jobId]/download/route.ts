import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { canAccessJob, getDeck, getJob } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  if (!UUID.test(jobId)) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });

  const job = await getJob(jobId);
  if (!job) return NextResponse.json({ error: "Deck not ready" }, { status: 404 });

  // Same 404-for-everything rule as the status route.
  const { userId } = await auth();
  if (!canAccessJob(job, userId)) return NextResponse.json({ error: "Deck not ready" }, { status: 404 });

  const result = await getDeck(jobId);
  if (!result) return NextResponse.json({ error: "Deck not ready" }, { status: 404 });

  return new NextResponse(new Uint8Array(result.deck), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${result.deck_name}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
