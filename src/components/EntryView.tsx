import { SignInButton } from "@clerk/nextjs";
import { useEffect, useRef } from "react";

const REPO = "https://github.com/gengirish/research-to-deck";

/**
 * One line each. The page no longer argues its case at length — it states what
 * happens, takes the topic, and gets out of the way.
 */
const STEPS = [
  { n: "01", title: "Screen", body: "Your topic goes to OpenAlex, capped at the number of papers you ask for." },
  { n: "02", title: "Read", body: "Open-access PDFs in full, the rest at abstract level, all embedded for retrieval." },
  { n: "03", title: "Compose", body: "One finding per slide, every bullet carrying the references behind it." },
];

const PAPER_COUNTS = [10, 50, 100];

interface Props {
  topic: string;
  setTopic: (v: string) => void;
  paperCount: number;
  setPaperCount: (v: number) => void;
  email: string;
  setEmail: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
  error: string | null;
  /** true signed in, false signed out, undefined while Clerk is still loading. */
  signedIn: boolean | undefined;
}

export default function EntryView({
  topic,
  setTopic,
  paperCount,
  setPaperCount,
  email,
  setEmail,
  onSubmit,
  submitting,
  error,
  signedIn,
}: Props) {
  const errorRef = useRef<HTMLParagraphElement>(null);

  // A submit failure is announced by role="alert", but a keyboard user also needs to
  // *land* somewhere useful. The message is the recovery path, so send focus there.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  return (
    <main className="wrap wrap-narrow" id="main">
      <section className="lede-block">
        <h1 className="hero-title">
          <span>Fifty papers in,</span>
          <span>one cited deck out.</span>
        </h1>
        <p className="lede">
          Name a topic. We screen the OpenAlex corpus, read the papers that matter, and compose a PowerPoint with
          per-bullet citations and speaker notes. Every claim traces back to a paper you can open.
        </p>
      </section>

      <form onSubmit={onSubmit} className="job-form">
        <div className="field" style={{ marginBottom: 18 }}>
          <label htmlFor="topic">Research topic</label>
          <input
            id="topic"
            className="input topic-input"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. retrieval-augmented generation in enterprise search"
            minLength={3}
            maxLength={300}
            required
          />
        </div>

        <div className="field-grid">
          <div className="field">
            <fieldset>
              <legend>Papers to read</legend>
              <div className="seg">
                {PAPER_COUNTS.map((n) => (
                  <label className="seg-opt" key={n}>
                    <input
                      type="radio"
                      name="paperCount"
                      value={n}
                      checked={paperCount === n}
                      onChange={() => setPaperCount(n)}
                    />
                    <span>{n}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="field-help">More papers means a broader sweep and a longer run.</p>
          </div>
          <div className="field">
            <label htmlFor="email">Email the deck (optional)</label>
            <input
              id="email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              maxLength={320}
              autoComplete="email"
              aria-describedby="email-help"
            />
            <p className="field-help" id="email-help">
              We send the .pptx when the run finishes. Optional — the deck is downloadable here either way.
            </p>
          </div>
        </div>

        <div className="submit-row">
          {signedIn === false ? (
            // A run costs model credits and minutes of worker time, so it is tied to
            // an account. The modal keeps the topic the visitor already typed.
            <SignInButton mode="modal">
              <button type="button" className="btn btn-primary btn-generate">
                Sign in to generate
              </button>
            </SignInButton>
          ) : (
            <button type="submit" className="btn btn-primary btn-generate" disabled={submitting || signedIn === undefined}>
              {submitting ? "Starting…" : "Generate deck"}
            </button>
          )}
          <span className="submit-note">
            {signedIn === false
              ? "Free account · your runs stay scoped to you"
              : "A few minutes · OpenAlex · .pptx with speaker notes"}
          </span>
        </div>
        {error && (
          <p className="form-error" role="alert" tabIndex={-1} ref={errorRef}>
            {error}
          </p>
        )}
      </form>

      <ol className="steps">
        {STEPS.map((s) => (
          <li className="step" key={s.n}>
            <div className="step-n">{s.n}</div>
            <div className="step-title">{s.title}</div>
            <p>{s.body}</p>
          </li>
        ))}
      </ol>

      <footer className="site-footer">
        <span>IntelliForge Deep Research · Research / Deck</span>
        <span>
          Data: OpenAlex · <a href={REPO}>Source</a>
        </span>
      </footer>
    </main>
  );
}
