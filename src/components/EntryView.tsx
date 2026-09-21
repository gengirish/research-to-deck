import { SignInButton } from "@clerk/nextjs";
import { useEffect, useRef } from "react";
import Image from "next/image";
import { Blueprint, Eyebrow, SheetHead } from "./Blueprint";

const REPO = "https://github.com/gengirish/research-to-deck";

const STEPS = [
  {
    n: "01",
    title: "Screen the corpus",
    body: "Your topic goes to OpenAlex. Results are ranked and capped at the number of papers you ask for, then recorded against the run.",
  },
  {
    n: "02",
    title: "Read and index",
    body: "Open-access PDFs are downloaded and read in full; the rest are used at abstract level. Everything is chunked and embedded into pgvector.",
  },
  {
    n: "03",
    title: "Compose the deck",
    body: "Claude drafts one finding per slide from the strongest retrieved passages, and every bullet carries the reference numbers behind it.",
  },
];

const SPEC = [
  { n: "01", k: "Slides", v: "8–12 + references" },
  { n: "02", k: "Citations", v: "per bullet" },
  { n: "03", k: "Speaker notes", v: "included" },
  { n: "04", k: "Format", v: ".pptx" },
  { n: "05", k: "Corpus", v: "OpenAlex" },
];

const FIGURES = [
  { n: "01", k: "Works indexed", v: "250M+", note: "OpenAlex, updated continuously" },
  { n: "02", k: "Papers read per run", v: "50", note: "Configurable from 10 to 100" },
  { n: "03", k: "Slides per deck", v: "8–12", note: "One finding per slide" },
  { n: "04", k: "Bullets carrying a citation", v: "100%", note: "Uncited bullets are repaired or dropped" },
];

const OUTPUTS = [
  {
    n: "01",
    title: "Cited slides",
    body: "One finding per slide. Each bullet carries the reference numbers of the papers it came from, and the deck closes with the full numbered list.",
  },
  {
    n: "02",
    title: "Speaker notes",
    body: "Written into the .pptx as real notes, not a text box — including which sources sit behind the slide you are standing on.",
  },
  {
    n: "03",
    title: "Source list",
    body: "Every cited paper with authors, year, venue and a resolvable DOI, numbered in the order the deck first refers to it.",
  },
];

const PROOF = [
  {
    n: "01",
    title: "A numbered reference list",
    body: "Bullets carry reference numbers; the deck ends with the papers those numbers point at, DOIs included.",
  },
  {
    n: "02",
    title: "The reading log is live",
    body: "Watch each paper enter the corpus as it is fetched, and whether it was read in full text or only at abstract level.",
  },
  {
    n: "03",
    title: "Citations are validated, not trusted",
    body: "Before rendering, every citation is checked against the papers actually retrieved for your topic. Unknown ones are repaired or removed.",
  },
  {
    n: "04",
    title: "The run keeps its own record",
    body: "Papers screened, chunks indexed, slides written and per-stage timings are all stored with the job and shown back to you.",
  },
];

const FAQ = [
  {
    n: "01",
    q: "Where do the papers come from?",
    a: "OpenAlex, for both discovery and metadata. Open-access PDFs are downloaded and read in full; where no PDF is reachable the paper is used at abstract level and the run log says so.",
  },
  {
    n: "02",
    q: "How is evidence chosen for a slide?",
    a: "Claude writes several sub-queries covering the topic, each runs as a vector search over the papers read for this run, and the pool is reranked. At most three passages come from any one paper, so a single source cannot carry the deck.",
  },
  {
    n: "03",
    q: "Can I edit the deck afterwards?",
    a: "It is an ordinary .pptx built with python-pptx — native text boxes and real speaker notes, no images of text. Open it in PowerPoint, Keynote or Slides and edit anything.",
  },
  {
    n: "04",
    q: "Is anything invented?",
    a: "Claude may only cite papers retrieved for your topic. The draft is validated against that set before rendering, and a slide whose citations cannot be resolved is repaired or dropped rather than shipped.",
  },
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
    <main className="wrap" id="main">
      <div className="plate">
        <section style={{ flex: "1 1 440px", minWidth: 0 }}>
          <Eyebrow label="Deep research engine" sheet="IF‑RES · v4" />

          <h1 className="hero-title">
            <span>Fifty papers in,</span>
            <span>one cited deck out.</span>
          </h1>

          <div className="hero-band">
            <span className="tick" />
            <span className="run" />
            <span style={{ whiteSpace: "nowrap" }}>Screen · read · compose</span>
            <span className="run" />
            <span className="tick" />
          </div>

          <p className="lede">
            Name a topic. We screen the OpenAlex corpus, read the papers that matter, and compose a branded PowerPoint with
            per‑bullet citations and speaker notes. Every claim traces back to a paper you can open.
          </p>

          <Blueprint style={{ background: "var(--color-bg)", boxShadow: "var(--shadow-sm)" }}>
            <SheetHead title="Job sheet — new run" marks={["IF‑RES", "Rev C", "Sheet 01 of 01"]} />
            <form onSubmit={onSubmit} style={{ padding: "20px 22px" }}>
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
                    <button type="button" className="btn btn-primary blueprint btn-generate">
                      <i className="corner tl" />
                      <i className="corner tr" />
                      <i className="corner bl" />
                      <i className="corner br" />
                      Sign in to generate
                    </button>
                  </SignInButton>
                ) : (
                  <button type="submit" className="btn btn-primary blueprint btn-generate" disabled={submitting || signedIn === undefined}>
                    <i className="corner tl" />
                    <i className="corner tr" />
                    <i className="corner bl" />
                    <i className="corner br" />
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
          </Blueprint>

          <div className="steps">
            {STEPS.map((s) => (
              <div className="step" key={s.n}>
                <div className="step-n">{s.n}</div>
                <div className="step-title">{s.title}</div>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        <aside className="hero-aside">
          <Blueprint as="figure" className="duotone">
            <Image
              src="/assets/corpus.jpg"
              alt=""
              width={1600}
              height={1100}
              priority
              style={{ width: "100%", height: "auto", aspectRatio: "16 / 11", objectFit: "cover", filter: "grayscale(1) contrast(1.06)" }}
            />
          </Blueprint>
          <div className="fig-caption">
            <span className="n">Fig. 01</span>
            <span className="fill" />
            <span>The corpus, as read</span>
          </div>

          <Blueprint style={{ padding: 20, background: "var(--color-bg)" }}>
            <div className="panel-head">
              <span className="panel-label">Output spec</span>
              <span className="meta">Sheet 1/1</span>
            </div>
            <table className="table" style={{ fontSize: 13 }}>
              <tbody>
                {SPEC.map((s) => (
                  <tr key={s.n}>
                    <td style={{ width: 34, color: "var(--color-accent-700)", fontFamily: "var(--font-heading)", letterSpacing: "0.08em" }}>
                      {s.n}
                    </td>
                    <td>{s.k}</td>
                    <td style={{ textAlign: "right", color: "var(--color-neutral-700)" }}>{s.v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Blueprint>

          <Blueprint className="reverse" style={{ padding: 18 }}>
            <div className="panel-label" style={{ opacity: 0.75, marginBottom: 14, color: "inherit" }}>
              Sample slide
            </div>
            <div
              aria-hidden="true"
              style={{
                border: "1px solid color-mix(in srgb, var(--color-bg) 35%, transparent)",
                padding: 16,
                aspectRatio: "16 / 9",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", opacity: 0.7, marginBottom: 8 }}>
                  Finding 03
                </div>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 22, lineHeight: 1.05, textTransform: "uppercase" }}>
                  Retrieval quality
                  <br />
                  outweighs model size
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
                <span style={{ display: "block", width: 16, height: 22, background: "color-mix(in srgb, var(--color-bg) 45%, transparent)" }} />
                <span style={{ display: "block", width: 16, height: 38, background: "color-mix(in srgb, var(--color-bg) 70%, transparent)" }} />
                <span style={{ display: "block", width: 16, height: 30, background: "color-mix(in srgb, var(--color-bg) 45%, transparent)" }} />
                <span style={{ marginLeft: "auto", fontSize: 9, opacity: 0.7, letterSpacing: "0.04em" }}>[2] [7]</span>
              </div>
            </div>
            <p style={{ fontSize: 12, lineHeight: 1.5, margin: "14px 0 0", opacity: 0.8 }}>
              Illustrative layout. Speaker notes and the numbered source list ship inside the file.
            </p>
          </Blueprint>
        </aside>
      </div>

      <section style={{ marginTop: 68 }} id="how">
        <Blueprint style={{ background: "var(--color-bg)" }}>
          <SheetHead title="Standard run — what the pipeline does" marks={["OpenAlex + Voyage + Claude", "Sheet 02"]} />
          {FIGURES.map((f) => (
            <div className="datarow" key={f.n}>
              <span className="n">{f.n}</span>
              <span className="k">{f.k}</span>
              <span className="v">{f.v}</span>
              <span className="note">{f.note}</span>
            </div>
          ))}
          <p className="sheet-foot">Run time depends on topic, PDF availability and queue depth.</p>
        </Blueprint>
      </section>

      <section style={{ marginTop: 72 }}>
        <Eyebrow label="02 · What you get" />
        <h2 className="section-title">A deck you can defend in the room</h2>
        <div className="card-row">
          {OUTPUTS.map((o) => (
            <Blueprint className="out-card" key={o.n}>
              <div className="out-n">{o.n}</div>
              <div className="out-title">{o.title}</div>
              <p>{o.body}</p>
            </Blueprint>
          ))}
        </div>
      </section>

      <Blueprint
        as="section"
        className="reverse hatch"
        id="verifiability"
        style={{ marginTop: 72, padding: "clamp(26px,3.4vw,48px)" }}
      >
        <Eyebrow label="03 · Verifiability" sheet="Sheet 03" />
        <div style={{ display: "flex", flexWrap: "wrap", gap: "clamp(28px,4vw,52px)", alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 380px", minWidth: 0 }}>
            <h2 style={{ fontSize: "clamp(28px,3.6vw,46px)", textTransform: "uppercase", lineHeight: 1.02, margin: "0 0 16px", maxWidth: "22ch" }}>
              Nothing here asks you to take our word
            </h2>
            <p className="reverse-lede">
              A synthesis you cannot audit is an opinion with footnotes. Four things ship with every run so you can check the
              work in minutes, not days.
            </p>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {PROOF.map((p) => (
                <div className="proof-row" key={p.n}>
                  <span className="n">{p.n}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="proof-title">{p.title}</div>
                    <p>{p.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              flex: "1 1 300px",
              minWidth: 0,
              maxWidth: 420,
              padding: 20,
              border: "1px solid color-mix(in srgb, var(--color-bg) 34%, transparent)",
              background: "color-mix(in srgb, var(--color-bg) 6%, transparent)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                fontSize: 12,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "var(--color-accent-300)",
                marginBottom: 16,
              }}
            >
              <span>What the run records</span>
              <span style={{ color: "color-mix(in srgb, var(--color-bg) 62%, transparent)" }}>Every job</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {[
                ["Papers screened", "OpenAlex hits for your topic"],
                ["Read in full text", "Open-access PDFs downloaded"],
                ["Chunks indexed", "Embedded into pgvector"],
                ["Passages retrieved", "After reranking and capping"],
                ["Slides and references", "Written, validated, rendered"],
                ["Per-stage timings", "Search through render"],
              ].map(([k, v]) => (
                <div
                  key={k}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "9px 0",
                    borderBottom: "1px solid color-mix(in srgb, var(--color-bg) 14%, transparent)",
                    fontSize: 12,
                  }}
                >
                  <span>{k}</span>
                  <span style={{ color: "color-mix(in srgb, var(--color-bg) 62%, transparent)", textAlign: "right" }}>{v}</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, lineHeight: 1.5, margin: "12px 0 0", color: "color-mix(in srgb, var(--color-bg) 78%, transparent)" }}>
              The activity log streams all of it while the job runs, and stays with the finished deck.
            </p>
          </div>
        </div>
      </Blueprint>

      <section style={{ marginTop: 72 }}>
        <Eyebrow label="04 · Questions" />
        <div className="faq-grid">
          {FAQ.map((f) => (
            <div className="faq" key={f.n}>
              <div className="faq-n">{f.n}</div>
              <div className="faq-q">{f.q}</div>
              <p>{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <Blueprint as="section" className="reverse cta">
        <div style={{ flex: "1 1 380px", minWidth: 0 }}>
          <div className="cta-kicker">Start a run</div>
          <h2>Name a topic. The citations are the point.</h2>
        </div>
        <a className="btn blueprint btn-invert" href="#topic">
          <i className="corner tl" />
          <i className="corner tr" />
          <i className="corner bl" />
          <i className="corner br" />
          Generate a deck
        </a>
      </Blueprint>

      <footer className="site-footer">
        <span>IntelliForge Deep Research · Research / Deck</span>
        <span>
          Data: OpenAlex · <a href={REPO}>Source</a>
        </span>
      </footer>
    </main>
  );
}
