"use client";

import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import EntryView from "@/components/EntryView";
import HandoffView from "@/components/HandoffView";
import ResultView from "@/components/ResultView";
import RunningView from "@/components/RunningView";
import ThemeSwitch from "@/components/ThemeSwitch";
import { formatDuration, JobEvent, JobStatus } from "@/components/deck";

const REPO = "https://github.com/gengirish/research-to-deck";

export default function Home() {
  // `isLoaded` is false for the first paint, so the form shows a neutral disabled
  // button rather than flashing "Sign in" at an already signed-in user.
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const [topic, setTopic] = useState("");
  const [paperCount, setPaperCount] = useState(50);
  const [email, setEmail] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // True once polling has missed three consecutive times — surfaced, not swallowed.
  const [stale, setStale] = useState(false);
  // The run has been accepted but no status poll has answered yet. Without this the
  // job sheet sits there looking untouched for up to 1.5s and then vanishes.
  const [handingOff, setHandingOff] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Poll the job, asking only for activity we have not already rendered.
  useEffect(() => {
    if (!jobId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let since = 0;

    let misses = 0;

    const poll = async () => {
      try {
        const res = await fetch(`/api/decks/${jobId}?since=${since}`, { cache: "no-store" });
        if (stopped) return;
        if (res.ok) {
          const data = (await res.json()) as JobStatus;
          misses = 0;
          setStale(false);
          setHandingOff(false);
          setJob(data);
          if (data.events.length) {
            since = Math.max(since, data.events[data.events.length - 1].id);
            setEvents((prev) => {
              const seen = new Set(prev.map((e) => e.id));
              return [...prev, ...data.events.filter((e) => !seen.has(e.id))];
            });
          }
          if (data.status === "done" || data.status === "failed") return;
        } else {
          misses += 1;
        }
      } catch {
        // Transient network error: fall through and try again on the next tick.
        misses += 1;
      }
      // Keep retrying either way, but stop pretending everything is fine. One blip is
      // noise; three in a row is something the person watching the run should know.
      if (!stopped && misses >= 3) setStale(true);
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
    await startRun();
  }

  /**
   * Post the current form state and hand the page over to the run views.
   *
   * Separated from the submit handler so a failed run can re-submit the exact same
   * topic / count / email without the person retyping any of it. `setJobId(null)`
   * first matters on a retry: the API can hand back the same job id, and the poll
   * effect is keyed on that id, so without the null in between it would never
   * restart.
   */
  async function startRun() {
    setSubmitting(true);
    setSubmitError(null);
    setStale(false);
    setJob(null);
    setJobId(null);
    setEvents([]);
    setHandingOff(true);
    try {
      const res = await fetch("/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, paperCount, ...(email ? { email } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) throw new Error("Your session expired. Sign in again to start a run.");
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setNow(Date.now());
      setJobId(data.jobId);
    } catch (err) {
      // Back to the job sheet with the error and everything still filled in.
      setHandingOff(false);
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
    setStale(false);
    setHandingOff(false);
  }

  const lastAt = events.at(-1)?.at;
  const elapsed = job
    ? formatDuration((running ? now : new Date(lastAt ?? job.createdAt).getTime()) - new Date(job.createdAt).getTime())
    : "0:00";

  const view: "entry" | "handoff" | "running" | "result" =
    job && job.status === "done" && job.deck ? "result" : job ? "running" : handingOff ? "handoff" : "entry";

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
        <a href={`${REPO}#api`}>API</a>
        <span className="tag tag-outline" style={{ letterSpacing: "0.1em", textTransform: "uppercase", fontSize: 12 }}>
          Beta
        </span>
        <ThemeSwitch />
        <div className="nav-auth">
          {/* Core 3 removed <SignedIn>/<SignedOut>; the hook we already read covers this,
              and gating on `authLoaded` keeps the header from flickering on first paint. */}
          {authLoaded &&
            (isSignedIn ? (
              <UserButton />
            ) : (
              <SignInButton mode="modal">
                <button type="button" className="btn btn-secondary">
                  Sign in
                </button>
              </SignInButton>
            ))}
        </div>
      </header>
      <div className="rule" />

      {/* One keyed wrapper per view, so a swap replays `.view-fade` — a 320ms
          opacity-and-lift crossfade rather than a cut. The hand-off view sits
          between the sheet and the run view carrying the same topic in the same
          slot, so the heading does not appear to jump across the transition. */}
      <div className="view-fade" key={view}>
        {view === "result" && job?.deck ? (
          <ResultView job={job} deck={job.deck} onReset={reset} />
        ) : view === "running" && job ? (
          <RunningView
            job={job}
            events={events}
            elapsed={elapsed}
            stale={stale}
            onCancelView={reset}
            onRetry={startRun}
          />
        ) : view === "handoff" ? (
          <HandoffView topic={topic} paperCount={paperCount} />
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
            signedIn={authLoaded ? isSignedIn === true : undefined}
          />
        )}
      </div>
    </div>
  );
}
