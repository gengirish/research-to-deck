import { NextResponse } from "next/server";
import { getDeck } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  if (!UUID.test(jobId)) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });

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
