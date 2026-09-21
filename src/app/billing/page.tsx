import BillingView from "@/components/BillingView";

export const metadata = { title: "Credits & brand · CiteDeck" };

export default async function Page({ searchParams }: { searchParams: Promise<{ checkout?: string; status?: string }> }) {
  // Dodo appends `payment_id` and `status` to the return URL.
  const { checkout, status } = await searchParams;
  return <BillingView checkout={checkout} paymentStatus={status} />;
}
