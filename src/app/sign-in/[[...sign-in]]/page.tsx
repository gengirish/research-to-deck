import { SignIn } from "@clerk/nextjs";
import AuthShell from "@/components/AuthShell";

export const metadata = { title: "Sign in · Research-to-Deck" };

export default function Page() {
  return (
    <AuthShell
      title="Sign in"
      blurb="A deck run reads up to 100 papers and bills real model usage, so runs are tied to an account."
    >
      <SignIn />
    </AuthShell>
  );
}
