import { clerkClient } from "@clerk/nextjs/server";

/**
 * The Clerk user who owns `email` as a verified address, or null. Clerk's list filter
 * is not guaranteed exact, so the match is re-checked here: an unverified address must
 * never let a stranger spend someone's credits.
 */
export async function findUserIdByEmail(email: string): Promise<string | null> {
  const target = email.trim().toLowerCase();
  const { data } = await (await clerkClient()).users.getUserList({ emailAddress: [target], limit: 10 });
  const match = data.find((user) =>
    user.emailAddresses.some((a) => a.emailAddress.toLowerCase() === target && a.verification?.status === "verified"),
  );
  return match?.id ?? null;
}
