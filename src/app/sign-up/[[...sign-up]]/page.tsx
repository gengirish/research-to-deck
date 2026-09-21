import { SignUp } from "@clerk/nextjs";
import AuthShell from "@/components/AuthShell";

export const metadata = { title: "Create an account · CiteDeck" };

export default function Page() {
  return (
    <AuthShell
      title="Create an account"
      blurb="Your runs stay yours: every deck you generate is scoped to your account."
    >
      <SignUp />
    </AuthShell>
  );
}
