import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getBrand } from "@/lib/brand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in account's logo, for the preview on the billing page. */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const logo = (await getBrand(userId))?.logo;
  if (!logo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(logo.bytes), {
    headers: { "Content-Type": logo.type, "Cache-Control": "private, no-store" },
  });
}
