import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { canUseCustomBrand, getAccount, isBillingEnabled } from "@/lib/billing";
import { checkLogo, deleteBrand, getBrand, MAX_LOGO_BYTES, parseBrand, saveBrand, type BrandLogo } from "@/lib/brand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in account's saved brand, or `brand: null`. */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to manage your brand" }, { status: 401 });
  const saved = await getBrand(userId);
  return NextResponse.json({ brand: saved?.brand ?? null, hasLogo: Boolean(saved?.logo) });
}

/**
 * Saves the brand from a multipart form: name, footer, primary, accent, dark, and an
 * optional `logo` file. `removeLogo=1` clears the stored logo; omitting both keeps it.
 * Custom branding is the paid feature, so this answers 402 until a first purchase.
 */
export async function PUT(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to manage your brand" }, { status: 401 });
  if (isBillingEnabled() && !canUseCustomBrand(await getAccount(userId))) {
    return NextResponse.json({ error: "Custom branding unlocks with your first credit purchase" }, { status: 402 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Body must be multipart form data" }, { status: 400 });
  }
  const fields = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
  const parsed = parseBrand(fields);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  let logo: BrandLogo | null | undefined;
  const file = form.get("logo");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_LOGO_BYTES) return NextResponse.json({ error: `Logo must be under ${MAX_LOGO_BYTES / 1024} KB` }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const checked = checkLogo(bytes);
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
    logo = { bytes, type: checked.type };
  } else if (form.get("removeLogo") === "1") {
    logo = null;
  }

  await saveBrand(userId, parsed.brand, logo);
  const saved = await getBrand(userId);
  return NextResponse.json({ brand: saved?.brand ?? null, hasLogo: Boolean(saved?.logo) });
}

/** Removes the brand; later decks render with the default IntelliForge brand. */
export async function DELETE() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to manage your brand" }, { status: 401 });
  await deleteBrand(userId);
  return NextResponse.json({ brand: null, hasLogo: false });
}
