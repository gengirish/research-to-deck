import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { canUseCustomBrand, CREDIT_PACKS, FREE_CREDITS, getAccount, isBillingEnabled } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in account's credits, and what it can buy. */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to see your credits" }, { status: 401 });

  if (!isBillingEnabled()) {
    return NextResponse.json({ enabled: false, balance: null, paid: false, canBrand: true, packs: [], freeCredits: 0 });
  }
  const account = await getAccount(userId);
  return NextResponse.json({
    enabled: true,
    balance: account.balance,
    paid: account.paid,
    canBrand: canUseCustomBrand(account),
    packs: CREDIT_PACKS,
    freeCredits: FREE_CREDITS,
  });
}
