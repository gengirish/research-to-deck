"use client";

import { useEffect, useState } from "react";
import EntryView from "@/components/EntryView";
import ResultView from "@/components/ResultView";
import RunningView from "@/components/RunningView";
import { formatDuration, JobEvent, JobStatus } from "@/components/deck";

const REPO = "https://github.com/gengirish/research-to-deck";

export default function Home() {
  const [topic, setTopic] = useState("");
  const [paperCount, setPaperCount] = useState(50);
  const [email, setEmail] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setJob(null);
    setEvents([]);
    try {
      const res = await fetch("/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, paperCount, ...(email ? { email } : {}) }),
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

  function reset() {
    setJobId(null);
    setJob(null);
    setEvents([]);
    setSubmitError(null);
  }

  const lastAt = events.at(-1)?.at;
  const elapsed = job
    ? formatDuration((running ? now : new Date(lastAt ?? job.createdAt).getTime()) - new Date(job.createdAt).getTime())
    : "0:00";

  return (
    <div className="shell">
      <header className="nav site-nav">
        <div className="nav-brand brand-lock">
          <span className="mark">IntelliForge</span>
          <span className="sub">Research / Deck</span>
        </div>
        <a href="#how">Method</a>
        <a href="#verifiability">Verifiability</a>
        <a href={`${REPO}#api`}>API</a>
        <span className="tag tag-outline" style={{ letterSpacing: "0.1em", textTransform: "uppercase", fontSize: 10 }}>
          Beta
        </span>
      </header>
      <div className="rule" />

      {job && job.status === "done" && job.deck ? (
        <ResultView job={job} deck={job.deck} onReset={reset} />
      ) : job ? (
        <RunningView job={job} events={events} elapsed={elapsed} onCancelView={reset} />
      ) : (
        <EntryView
          topic={topic}
          setTopic={setTopic}
          paperCount={paperCount}
          setPaperCount={setPaperCount}
          email={email}
          setEmail={setEmail}
          onSubmit={onSubmit}
          submitting={submitting}
          error={submitError}
        />
      )}
    </div>
  );
}
