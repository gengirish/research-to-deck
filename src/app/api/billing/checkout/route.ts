import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { findPack, isBillingEnabled } from "@/lib/billing";
import { createCheckout } from "@/lib/dodo";

export const runtime = "nodejs";

/** Starts a Dodo Payments checkout for one credit pack; the client redirects to `url`. */
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to buy credits" }, { status: 401 });
  if (!isBillingEnabled()) return NextResponse.json({ error: "Billing is not enabled on this deployment" }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as { packId?: unknown };
  const pack = findPack(body.packId);
  if (!pack) return NextResponse.json({ error: "Unknown credit pack" }, { status: 400 });

  try {
    const url = await createCheckout(pack, userId, new URL(request.url).origin);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[dodo] checkout session failed", err);
    return NextResponse.json({ error: "Could not start checkout, try again shortly" }, { status: 502 });
  }
}
