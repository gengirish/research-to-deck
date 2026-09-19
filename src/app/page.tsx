"use client";

import { useEffect, useState } from "react";

interface JobStatus {
  jobId: string;
  status: "queued" | "running" | "done" | "failed";
  stage: string;
  progress: number;
  error: string | null;
  downloadUrl: string | null;
  stats: {
    ingest?: { papers: number; pdf: number; abstract: number; titleOnly: number };
    slides?: number;
    references?: number;
    timings?: { total_s?: number };
  };
}

const STAGE_LABELS: Record<string, string> = {
  queued: "Waiting for a worker",
  searching: "Searching Semantic Scholar",
  ingesting: "Downloading and embedding papers",
  retrieving: "Finding the strongest evidence",
  synthesizing: "Writing slides with Claude",
  rendering: "Building the PowerPoint",
  done: "Deck ready",
  failed: "Failed",
};

export default function Home() {
  const [topic, setTopic] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const poll = async () => {
      const res = await fetch(`/api/decks/${jobId}`, { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as JobStatus;
      setJob(data);
      if (data.status !== "done" && data.status !== "failed") setTimeout(poll, 2000);
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setJob(null);
    try {
      const res = await fetch("/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setJobId(data.jobId);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  const running = job && job.status !== "done" && job.status !== "failed";

  return (
    <main>
      <div className="eyebrow">IntelliForge Deep Research</div>
      <h1>Research-to-Deck</h1>
      <p className="lede">
        Enter a research topic. We read 50+ papers from Semantic Scholar and turn them into a cited, branded PowerPoint deck with
        speaker notes.
      </p>

      <form onSubmit={onSubmit}>
        <label htmlFor="topic">Research topic</label>
        <input
          id="topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. retrieval-augmented generation evaluation"
          minLength={3}
          maxLength={300}
          required
        />
        <button type="submit" disabled={submitting || Boolean(running)}>
          {submitting ? "Starting…" : running ? "Generating…" : "Generate deck"}
        </button>
        {submitError && <p className="error">{submitError}</p>}
      </form>

      {job && (
        <section className="card" aria-live="polite">
          <strong>{STAGE_LABELS[job.stage] ?? job.stage}</strong>
          <div className="bar" role="progressbar" aria-valuenow={job.progress} aria-valuemin={0} aria-valuemax={100}>
            <div style={{ width: `${job.progress}%` }} />
          </div>
          {job.stats.ingest && (
            <p className="stats">
              {job.stats.ingest.papers} papers · {job.stats.ingest.pdf} full-text · {job.stats.ingest.abstract + job.stats.ingest.titleOnly}{" "}
              abstract-only
              {job.stats.slides ? ` · ${job.stats.slides} slides · ${job.stats.references} references` : ""}
              {job.stats.timings?.total_s ? ` · ${job.stats.timings.total_s}s` : ""}
            </p>
          )}
          {job.status === "failed" && <p className="error">{job.error}</p>}
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
