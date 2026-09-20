import { useState } from "react";
import { Blueprint } from "./Blueprint";
import { JobStatus, pad2, RenderDeck, slideRefs, splitReference } from "./deck";

/** "Lewis, Perez, Piktus, et al. (2020)" — authors and year from a formatted reference. */
function shortCite(text: string): string {
  const withYear = text.match(/^(.*?\((?:\d{4}|n\.d\.)\))/);
  if (withYear) return withYear[1];
  const stop = text.indexOf(". ");
  return stop === -1 ? text : text.slice(0, stop);
}

/**
 * The renderer appends "Sources on this slide: [1] [2]" to the notes so it reaches
 * the .pptx. On screen the sources panel already says it, so drop it here.
 */
function notesBody(notes: string): string {
  const cut = notes.indexOf("Sources on this slide:");
  return (cut === -1 ? notes : notes.slice(0, cut)).trim();
}

function confidenceLabel(n: number): string {
  if (n >= 3) return "3+ sources";
  if (n === 2) return "2 sources";
  if (n === 1) return "Single source";
  return "Uncited";
}

export default function ResultView({ job, deck, onReset }: { job: JobStatus; deck: RenderDeck; onReset: () => void }) {
  const [active, setActive] = useState(0);
  const slide = deck.slides[active];
  const refs = slideRefs(slide);
  const byNumber = new Map(deck.references.map((r) => [r.n, r.text]));

  // Coverage is this slide's source count against the best-covered slide in the deck.
  const maxRefs = Math.max(1, ...deck.slides.map((s) => slideRefs(s).length));
  const coverage = Math.round((refs.length / maxRefs) * 100);

  const t = job.stats.timings ?? {};
  const ingest = job.stats.ingest;
  const record: [string, string][] = [
    ["Papers screened", String(job.stats.papers_found ?? "—")],
    ["Read in full text", ingest ? `${ingest.pdf} of ${ingest.papers}` : "—"],
    ["Chunks indexed", ingest ? ingest.chunks.toLocaleString() : "—"],
    ["Passages retrieved", String(job.stats.retrieved_chunks ?? "—")],
    ["Slides / references", `${deck.slides.length} / ${deck.references.length}`],
    ["Run time", t.total_s ? `${t.total_s}s` : "—"],
  ];

  return (
    <main className="wrap" style={{ paddingTop: 36 }}>
      <div className="result-head">
        <div>
          <div className="panel-label" style={{ marginBottom: 8 }}>
            Deck ready · {deck.slides.length} slides · {deck.references.length} references
          </div>
          <h2 className="result-title">{deck.title}</h2>
          {deck.subtitle && (
            <p style={{ margin: "10px 0 0", fontSize: 14, color: "var(--color-neutral-700)", maxWidth: "60ch" }}>
              {deck.subtitle}
            </p>
          )}
        </div>
        <div className="result-actions">
          <button type="button" className="btn btn-secondary" onClick={onReset}>
            New run
          </button>
          {job.downloadUrl && (
            <a className="btn btn-primary blueprint" href={job.downloadUrl} style={{ padding: "11px 22px" }}>
              <i className="corner tl" />
              <i className="corner tr" />
              <i className="corner bl" />
              <i className="corner br" />
              Download .pptx
            </a>
          )}
        </div>
      </div>

      <div className="thumbs">
        {deck.slides.map((s, i) => {
          const n = slideRefs(s).length;
          return (
            <button
              type="button"
              key={s.title + i}
              className={i === active ? "thumb thumb-on" : "thumb"}
              onClick={() => setActive(i)}
              aria-current={i === active}
            >
              <span className="thumb-head">
                <span>{pad2(i + 1)}</span>
                <span className="cites">{n === 1 ? "1 src" : `${n} srcs`}</span>
              </span>
              <span className="thumb-title">{s.title}</span>
            </button>
          );
        })}
      </div>

      <div className="result-cols">
        <div className="result-main">
          <Blueprint style={{ padding: 0, background: "var(--color-bg)" }}>
            <div className="slide">
              <div className="slide-head">
                <span className="panel-label">{deck.topic}</span>
                <span className="count">
                  <span className="n">{refs.length === 1 ? "1 source" : `${refs.length} sources`}</span>
                  <span>
                    {pad2(active + 1)} / {pad2(deck.slides.length)}
                  </span>
                </span>
              </div>
              <h3>{slide.title}</h3>
              <div className="slide-bullets">
                {slide.bullets.map((b, i) => (
                  <div className="slide-bullet" key={i}>
                    <span className="dot" />
                    <span className="text">
                      {b.text}
                      {b.refs.length > 0 && (
                        <span style={{ color: "var(--color-accent-700)", whiteSpace: "nowrap" }}>
                          {" "}
                          {b.refs.map((n) => `[${n}]`).join(" ")}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
              <div className="slide-foot">
                {refs.length ? refs.map((n) => shortCite(byNumber.get(n) ?? `[${n}]`)).join("   ·   ") : "No citations on this slide"}
              </div>
            </div>
          </Blueprint>

          <Blueprint className="notes-panel">
            <div className="panel-label" style={{ marginBottom: 8 }}>
              Speaker notes
            </div>
            <p style={{ whiteSpace: "pre-line" }}>{notesBody(slide.notes)}</p>
          </Blueprint>
        </div>

        <aside className="result-aside">
          <Blueprint style={{ padding: 16 }}>
            <div className="panel-head">
              <span className="panel-label">Sources on this slide</span>
              <span className="tag tag-accent" style={{ letterSpacing: "0.1em", textTransform: "uppercase", fontSize: 10 }}>
                {confidenceLabel(refs.length)}
              </span>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div className="bar-legend">
                <span>Coverage vs. best slide</span>
                <span>{coverage}%</span>
              </div>
              <div className="bar-mini">
                <div style={{ width: `${coverage}%` }} />
              </div>
            </div>
            <div className="source-list">
              {refs.length === 0 && (
                <p style={{ fontSize: 13, color: "var(--color-neutral-700)", margin: 0 }}>This slide cites no sources.</p>
              )}
              {refs.map((n) => {
                const { citation, href } = splitReference(byNumber.get(n) ?? "");
                return (
                  <div className="source" key={n}>
                    <div className="t">
                      <span style={{ color: "var(--color-accent-700)", fontFamily: "var(--font-heading)" }}>[{n}]</span>{" "}
                      {citation}
                    </div>
                    {href && (
                      <a className="m" href={href} target="_blank" rel="noreferrer" style={{ display: "block" }}>
                        {href.replace(/^https?:\/\//, "")}
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </Blueprint>

          <Blueprint style={{ padding: 16 }}>
            <div className="panel-label" style={{ marginBottom: 10 }}>
              Run record
            </div>
            <table className="table" style={{ fontSize: 12 }}>
              <tbody>
                {record.map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ paddingLeft: 0 }}>{k}</td>
                    <td style={{ textAlign: "right", paddingRight: 0, color: "var(--color-neutral-700)" }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: 11, lineHeight: 1.5, margin: "12px 0 0", color: "var(--color-neutral-600)" }}>
              {deck.stats_line}
            </p>
          </Blueprint>
        </aside>
      </div>
    </main>
  );
}
