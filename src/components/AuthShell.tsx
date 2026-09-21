import Link from "next/link";
import { Blueprint, Eyebrow } from "./Blueprint";

/**
 * Frame around Clerk's <SignIn />/<SignUp /> widgets so the auth pages read as part
 * of the Industry sheet rather than a dropped-in third-party form. The widgets
 * themselves are restyled through the `clerk` appearance block in globals.css.
 */
export default function AuthShell({
  eyebrow,
  title,
  blurb,
  children,
}: {
  eyebrow: string;
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="nav site-nav">
        <div className="nav-brand brand-lock">
          <span className="mark">IntelliForge</span>
          <span className="sub">Research / Deck</span>
        </div>
        <Link href="/">Back to the brief</Link>
      </header>
      <div className="rule" />

      <main className="auth-wrap" id="main">
        <Eyebrow label={eyebrow} sheet="A-01" />
        <h1 className="auth-title">{title}</h1>
        <p className="auth-blurb">{blurb}</p>
        <Blueprint className="auth-panel">{children}</Blueprint>
      </main>
    </div>
  );
}
