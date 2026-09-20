import { useEffect, useRef } from "react";
import { Blueprint, SheetHead } from "./Blueprint";
import { clock, JobEvent, JobStatus, pad2, PHASES, phaseIndex, stripCounter } from "./deck";

const MARKS = { done: "✓", active: "▸", todo: "·", failed: "×" } as const;

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
  onCancelView,
}: {
  job: JobStatus;
  events: JobEvent[];
  elapsed: string;
  onCancelView: () => void;
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
    <main className="wrap">
      <div className="run-head">
        <span>{failed ? "Run failed" : "Run in progress"}</span>
        <span className="job">Job #{job.jobId.slice(0, 8)}</span>
        <span className="job">Elapsed {elapsed}</span>
      </div>
      <h2 className="run-title">{job.topic}</h2>
      <p className="run-sub">
        {total ? `${total} papers` : "Screening"} ·{" "}
        {failed ? "the log below shows where it stopped" : "you can leave this page open; the run continues on the worker"}
      </p>

      <div className={failed ? "meter failed" : "meter"}>
        <div style={{ width: `${job.progress}%` }} />
      </div>
      <div className="meter-legend">
        <span>{failed ? "Stopped" : PHASES[current].label}</span>
        <span>{job.progress}%</span>
      </div>

      <div className="run-cols">
        <div className="run-left">
          {PHASES.map((phase, i) => {
            const state = failed && i === current ? "failed" : i < current ? "done" : i === current ? "active" : "todo";
            return (
              <div className={`phase phase-${state}`} key={phase.key}>
                <span className="mark">{MARKS[state]}</span>
                <span className="label">{phase.label}</span>
                <span className="stat">{phaseStat(phase.key, job, papers.length, i <= current)}</span>
              </div>
            );
          })}
          {failed && job.error && <p className="form-error">{job.error}</p>}
          <button type="button" className="btn btn-secondary" style={{ marginTop: 22 }} onClick={onCancelView}>
            {failed ? "Start another run" : "Back to the job sheet"}
          </button>
        </div>

        <Blueprint className="run-right">
          <div className="panel-head">
            <span className="panel-label">Papers admitted</span>
            <span className="meta">
              {papers.length}
              {total ? ` of ${total}` : ""}
            </span>
          </div>
          {papers.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--color-neutral-700)", margin: 0 }}>
              Waiting for the first paper to come back from OpenAlex…
            </p>
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
                    <td style={{ color: "var(--color-neutral-600)", fontSize: 12 }}>{p.n}</td>
                    <td>
                      <span style={{ display: "block", lineHeight: 1.3 }}>{p.title}</span>
                      {p.year && <span style={{ fontSize: 11, color: "var(--color-neutral-600)" }}>{p.year}</span>}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>{p.venue}</td>
                    <td style={{ textAlign: "right", fontSize: 11 }}>
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
          <ol className="log" ref={logRef} onScroll={(e) => {
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
