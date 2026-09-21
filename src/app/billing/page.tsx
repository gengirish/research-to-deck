import BillingView from "@/components/BillingView";

export const metadata = { title: "Credits & brand · CiteDeck" };

export default async function Page({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const { checkout } = await searchParams;
  return <BillingView checkout={checkout} />;
}
