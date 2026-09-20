"use client";

import { useEffect, useRef, useState } from "react";

interface JobEvent {
  id: number;
  stage: string;
  level: "info" | "success" | "warn" | "error";
  message: string;
  detail: Record<string, unknown> | null;
  at: string;
}

interface JobStatus {
  jobId: string;
  topic: string;
  status: "queued" | "running" | "done" | "failed";
  stage: string;
  progress: number;
  error: string | null;
  downloadUrl: string | null;
  events: JobEvent[];
  createdAt: string;
  stats: {
    papers_found?: number;
    ingest?: { papers: number; pdf: number; abstract: number; titleOnly: number; reused: number; chunks: number };
    sub_queries?: string[];
    retrieved_chunks?: number;
    retrieved_papers?: number;
    slides?: number;
    references?: number;
    citation_issues_fixed?: number;
    timings?: Record<string, number>;
  };
}

/** The pipeline, in the order the worker runs it. Drives the timeline. */
const STAGES = [
  { key: "queued", label: "Queued", hint: "Waiting for a free worker" },
  { key: "searching", label: "Search", hint: "Querying OpenAlex for papers" },
  { key: "ingesting", label: "Ingest", hint: "Fetching PDFs, chunking, embedding" },
  { key: "retrieving", label: "Retrieve", hint: "Multi-query vector search + rerank" },
  { key: "synthesizing", label: "Synthesize", hint: "Claude writes cited slides" },
  { key: "rendering", label: "Render", hint: "python-pptx builds the deck" },
  { key: "done", label: "Deck ready", hint: "Download the .pptx" },
] as const;

const stageIndex = (stage: string) => {
  const i = STAGES.findIndex((s) => s.key === stage);
  return i === -1 ? 0 : i;
};

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Wall-clock seconds each stage took, measured from the activity log itself: a stage
 * runs until the next stage in the pipeline first reports in. Walking STAGES in order
 * (rather than the event list) keeps the numbers monotonic.
 */
function stageDurations(events: JobEvent[]): Record<string, number> {
  const firstSeen = new Map<string, number>();
  for (const e of events) {
    if (!firstSeen.has(e.stage)) firstSeen.set(e.stage, new Date(e.at).getTime());
  }
  const out: Record<string, number> = {};
  for (const [i, stage] of STAGES.entries()) {
    const start = firstSeen.get(stage.key);
    const end = STAGES.slice(i + 1)
      .map((s) => firstSeen.get(s.key))
      .find((t): t is number => t !== undefined);
    if (start !== undefined && end !== undefined && end >= start) out[stage.key] = (end - start) / 1000;
  }
  return out;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

export default function Home() {
  const [topic, setTopic] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [showDetail, setShowDetail] = useState(true);

  const logRef = useRef<HTMLOListElement>(null);
  const pinnedToBottom = useRef(true);

  // Poll the job, asking only for activity we have not already rendered.
  useEffect(() => {
    if (!jobId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let since = 0;

    const poll = async () => {
      try {
        const res = await fetch(`/api/decks/${jobId}?since=${since}`, { cache: "no-store" });
        if (stopped) return;
        if (res.ok) {
          const data = (await res.json()) as JobStatus;
          setJob(data);
          if (data.events.length) {
            since = Math.max(since, data.events[data.events.length - 1].id);
            setEvents((prev) => {
              const seen = new Set(prev.map((e) => e.id));
              return [...prev, ...data.events.filter((e) => !seen.has(e.id))];
            });
          }
          if (data.status === "done" || data.status === "failed") return;
        }
      } catch {
        // Transient network error: fall through and try again on the next tick.
      }
      if (!stopped) timer = setTimeout(poll, 1500);
    };

    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [jobId]);

  const running = job ? job.status === "queued" || job.status === "running" : false;

  // Ticking elapsed clock, only while something is actually happening.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  // Follow the tail of the log unless the user has scrolled up to read something.
  useEffect(() => {
    const el = logRef.current;
    if (el && pinnedToBottom.current) el.scrollTop = el.scrollHeight;
  }, [events]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setJob(null);
    setEvents([]);
    pinnedToBottom.current = true;
    try {
      const res = await fetch("/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setNow(Date.now());
      setJobId(data.jobId);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  const current = stageIndex(job?.stage ?? "queued");
  const failed = job?.status === "failed";
  const durations = stageDurations(events);
  const elapsed = job ? formatDuration((running ? now : new Date(events.at(-1)?.at ?? job.createdAt).getTime()) - new Date(job.createdAt).getTime()) : null;
  const ingest = job?.stats.ingest;

  return (
    <main>
      <div className="eyebrow">IntelliForge Deep Research</div>
      <h1>Research-to-Deck</h1>
      <p className="lede">
        Enter a research topic. We read 50+ papers from OpenAlex and turn them into a cited, branded PowerPoint deck with
        speaker notes — and show you every step as it happens.
      </p>

      <form onSubmit={onSubmit}>
        <label htmlFor="topic">Research topic</label>
        <div className="row">
          <input
            id="topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. retrieval-augmented generation evaluation"
            minLength={3}
            maxLength={300}
            required
          />
          <button type="submit" disabled={submitting || running}>
            {submitting ? "Starting…" : running ? "Generating…" : "Generate deck"}
          </button>
        </div>
        {submitError && <p className="error">{submitError}</p>}
      </form>

      {job && (
        <section className="card" aria-live="polite">
          <header className="card-head">
            <div>
              <span className={`pill pill-${failed ? "error" : job.status === "done" ? "done" : "running"}`}>
                {failed ? "Failed" : job.status === "done" ? "Complete" : STAGES[current].label}
              </span>
              <span className="job-id">job {job.jobId.slice(0, 8)}</span>
            </div>
            <span className="elapsed" title="Elapsed time">
              {elapsed}
            </span>
          </header>

          <div
            className="bar"
            role="progressbar"
            aria-valuenow={job.progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Deck progress"
          >
            <div className={failed ? "bar-fill bar-failed" : "bar-fill"} style={{ width: `${job.progress}%` }} />
          </div>

          <ol className="timeline">
            {STAGES.map((stage, i) => {
              const done = job.status === "done";
              const state =
                failed && i === current ? "failed" : i < current || done ? "complete" : i === current ? "active" : "pending";
              const secs = durations[stage.key];
              return (
                <li key={stage.key} className={`step step-${state}`}>
                  <span className="dot" aria-hidden="true" />
                  <span className="step-label">{stage.label}</span>
                  <span className="step-hint">{stage.hint}</span>
                  {secs !== undefined && <span className="step-time">{secs.toFixed(1)}s</span>}
                </li>
              );
            })}
          </ol>

          {(job.stats.papers_found || ingest || job.stats.slides) && (
            <div className="stats-grid">
              {job.stats.papers_found !== undefined && <Stat label="papers found" value={job.stats.papers_found} />}
              {ingest && <Stat label="full text" value={ingest.pdf} />}
              {ingest && <Stat label="abstract only" value={ingest.abstract + ingest.titleOnly} />}
              {ingest && <Stat label="chunks indexed" value={ingest.chunks} />}
              {ingest?.reused ? <Stat label="cached" value={ingest.reused} /> : null}
              {job.stats.retrieved_chunks !== undefined && <Stat label="chunks used" value={job.stats.retrieved_chunks} />}
              {job.stats.slides !== undefined && <Stat label="slides" value={job.stats.slides} />}
              {job.stats.references !== undefined && <Stat label="references" value={job.stats.references} />}
            </div>
          )}

          {job.stats.sub_queries && job.stats.sub_queries.length > 0 && (
            <details className="queries">
              <summary>{job.stats.sub_queries.length} retrieval sub-queries Claude wrote</summary>
              <ul>
                {job.stats.sub_queries.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="log-head">
            <h2>Activity</h2>
            <label className="toggle">
              <input type="checkbox" checked={showDetail} onChange={(e) => setShowDetail(e.target.checked)} />
              Show details
            </label>
          </div>
          <ol
            className="log"
            ref={logRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            }}
          >
            {events.length === 0 && <li className="log-line log-info">Waiting for the worker to report in…</li>}
            {events.map((event) => (
              <li key={event.id} className={`log-line log-${event.level}`}>
                <time dateTime={event.at}>{clock(event.at)}</time>
                <span className="log-stage">{event.stage}</span>
                <span className="log-message">{event.message}</span>
                {showDetail && event.detail && (
                  <span className="log-detail">
                    {Object.entries(event.detail)
                      .filter(([k, v]) => k !== "seconds" && v !== null && v !== undefined && typeof v !== "object")
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" · ")}
                  </span>
                )}
              </li>
            ))}
            {running && (
              <li className="log-line log-pending">
                <span className="spinner" aria-hidden="true" />
                {STAGES[current].hint}…
              </li>
            )}
          </ol>

          {failed && <p className="error">{job.error}</p>}
          {job.downloadUrl && (
            <a className="download" href={job.downloadUrl}>
              Download deck (.pptx)
            </a>
          )}
        </section>
      )}
    </main>
  );
}
