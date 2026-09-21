import { useEffect, useRef } from "react";
import { Blueprint, Corners, SheetHead } from "./Blueprint";
import PaperSkeleton from "./PaperSkeleton";
import { clock, JobEvent, JobStatus, pad2, PHASES, phaseIndex, stripCounter } from "./deck";

const MARKS = { done: "✓", active: "▸", todo: "·", failed: "×" } as const;

/** What each mark means, for screen readers — the glyph alone says nothing. */
const STATE_WORD = { done: "done", active: "in progress", todo: "pending", failed: "failed" } as const;

/**
 * Each phase's headline number, taken from whatever the run has recorded so far.
 * A phase the run has not reached yet shows nothing, even when a later stat for it
 * already exists in the job.
 */
function phaseStat(key: string, job: JobStatus, ingested: number, reached: boolean): string {
  if (!reached) return "—";
  const { stats } = job;
  const t = stats.timings ?? {};
  switch (key) {
    case "searching":
      return stats.papers_found ? `${stats.papers_found} papers` : "—";
    case "ingesting":
      if (stats.ingest) return `${stats.ingest.chunks.toLocaleString()} chunks`;
      return ingested ? `${ingested}/${stats.papers_found ?? "…"}` : "—";
    case "retrieving":
      return stats.retrieved_chunks ? `${stats.retrieved_chunks} passages` : "—";
    case "synthesizing":
      return stats.slides ? `${stats.slides} slides` : "—";
    case "rendering":
      return t.render_s ? `${t.render_s}s` : "—";
    case "done":
      return t.total_s ? `${t.total_s}s` : "—";
    default:
      return "—";
  }
}

export default function RunningView({
  job,
  events,
  elapsed,
  stale,
  onCancelView,
  onRetry,
}: {
  job: JobStatus;
  events: JobEvent[];
  elapsed: string;
  /** Polling has missed three consecutive times. The run itself is unaffected. */
  stale: boolean;
  onCancelView: () => void;
  /** Re-submit the same topic, paper count and email. Offered only on a failure. */
  onRetry: () => void;
}) {
  const logRef = useRef<HTMLOListElement>(null);
  const pinned = useRef(true);

  // Follow the tail unless the user has scrolled up to read something.
  useEffect(() => {
    const el = logRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [events]);

  const current = phaseIndex(job.stage);
  const failed = job.status === "failed";
  const running = job.status === "queued" || job.status === "running";

  // Every paper the ingest stage has reported, in the order it landed.
  const papers = events
    .filter((e) => e.stage === "ingesting" && e.detail && typeof e.detail.source === "string")
    .map((e, i) => ({
      n: pad2(i + 1),
      title: stripCounter(e.message),
      venue: (e.detail?.venue as string) ?? "—",
      year: (e.detail?.year as number) ?? null,
      source: e.detail?.source as string,
    }));

  const total = job.stats.papers_found ?? null;

  return (
    <main className="wrap" id="main">
      <div className="run-head">
        <span>{failed ? "Run failed" : "Run in progress"}</span>
        <span className="job">Job #{job.jobId.slice(0, 8)}</span>
        <span className="job">Elapsed {elapsed}</span>
      </div>
      <h1 className="run-title">{job.topic}</h1>
      <p className="run-sub">
        {total ? `${total} papers` : "Screening"} ·{" "}
        {failed ? "the log below shows where it stopped" : "you can leave this page open; the run continues on the worker"}
      </p>

      {stale && (
        <p className="notice" role="status">
          Lost contact with the run — still retrying. The worker keeps going regardless; this page will catch up.
        </p>
      )}

      <div
        className={failed ? "meter failed" : "meter"}
        role="progressbar"
        aria-label="Run progress"
        aria-valuenow={job.progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${job.progress}% — ${failed ? "stopped" : PHASES[current].label}`}
      >
        <div style={{ transform: `scaleX(${job.progress / 100})` }} />
      </div>
      <div className="meter-legend">
        <span>{failed ? "Stopped" : PHASES[current].label}</span>
        <span>{job.progress}%</span>
      </div>

      <div className="run-cols">
        <div className="run-left">
          <ol className="phase-list">
            {PHASES.map((phase, i) => {
              const state = failed && i === current ? "failed" : i < current ? "done" : i === current ? "active" : "todo";
              return (
                <li
                  className={`phase phase-${state}`}
                  key={phase.key}
                  aria-current={state === "active" ? "step" : undefined}
                >
                  {/* The mark carries the state for anyone who cannot use the colour. */}
                  <span className="mark" aria-hidden="true">
                    {MARKS[state]}
                  </span>
                  <span className="label">{phase.label}</span>
                  <span className="vh">{STATE_WORD[state]}</span>
                  <span className="stat">{phaseStat(phase.key, job, papers.length, i <= current)}</span>
                </li>
              );
            })}
          </ol>
          {failed && job.error && (
            <p className="form-error" role="alert">
              {job.error}
            </p>
          )}
          {/* Every error carries a recovery path. On a failure the primary action is
              running it again — same topic, same count, same email — so the secondary
              "start another run" stays subordinate and there is still one primary CTA. */}
          <div className="recovery">
            {failed && (
              <button type="button" className="btn btn-primary blueprint" onClick={onRetry}>
                <Corners />
                Retry this topic
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={onCancelView}>
              {failed ? "Start another run" : "Back to the job sheet"}
            </button>
          </div>
        </div>

        <Blueprint className="run-right">
          <div className="panel-head">
            <span className="panel-label">Papers admitted</span>
            <span className="meta">
              {papers.length}
              {total ? ` of ${total}` : ""}
            </span>
          </div>
          {papers.length === 0 && failed ? (
            /* A skeleton promises something is coming. Nothing is: say so instead. */
            <p className="empty-note">None — the run stopped before any paper was read.</p>
          ) : papers.length === 0 ? (
            /* Not a sentence: a drawing of the rows that are coming, so the panel
               does not resize the moment the first `ingesting` event lands. */
            <PaperSkeleton />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 34 }}>#</th>
                  <th>Title</th>
                  <th style={{ width: 120 }}>Venue</th>
                  <th style={{ width: 96, textAlign: "right" }}>Read</th>
                </tr>
              </thead>
              <tbody>
                {papers.map((p) => (
                  <tr key={p.n}>
                    <td style={{ color: "var(--color-text-muted)", fontSize: 12 }}>{p.n}</td>
                    <td>
                      <span style={{ display: "block", lineHeight: 1.3 }}>{p.title}</span>
                      {p.year && <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{p.year}</span>}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>{p.venue}</td>
                    <td style={{ textAlign: "right", fontSize: 12 }}>
                      <span className={p.source === "full text" ? "tag tag-accent" : "tag tag-neutral"}>{p.source}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Blueprint>
      </div>

      <Blueprint style={{ marginTop: 34, background: "var(--color-bg)" }}>
        <SheetHead title="Activity log — everything the worker is doing" marks={[`${events.length} entries`]} />
        <div style={{ padding: "12px 18px 16px" }}>
          <ol
            className="log"
            ref={logRef}
            tabIndex={0}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            aria-label="Activity log"
            onScroll={(e) => {
            const el = e.currentTarget;
            pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          }}>
            {events.length === 0 && (
              <li className="log-pending">
                <span className="blink">▌</span> Waiting for the worker to report in…
              </li>
            )}
            {events.map((e) => {
              const detail = e.detail
                ? Object.entries(e.detail)
                    .filter(([k, v]) => k !== "seconds" && v !== null && v !== undefined && typeof v !== "object")
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" · ")
                : "";
              return (
                <li className={`log-line log-${e.level}`} key={e.id}>
                  <time dateTime={e.at}>{clock(e.at)}</time>
                  <span className="log-stage">{e.stage}</span>
                  <span className="log-message">{e.message}</span>
                  {detail && <span className="log-detail">{detail}</span>}
                </li>
              );
            })}
            {running && (
              <li className="log-pending">
                <span className="blink">▌</span> {PHASES[current].label}…
              </li>
            )}
          </ol>
        </div>
      </Blueprint>
    </main>
  );
}
