import { Blueprint } from "./Blueprint";
import PaperSkeleton from "./PaperSkeleton";

/**
 * The gap between "the API accepted the run" and the first status poll answering.
 *
 * Without it the job sheet sits there looking idle for up to 1.5s and then the run
 * view appears from nowhere. This holds the place instead, and it is built to be
 * the *same page* as `RunningView`: identical `.run-head` / `h1.run-title` /
 * `.run-sub` structure, the meter in the same slot, the papers panel already in
 * its skeleton state. Crossfading between the two therefore moves nothing — the
 * topic stays where it is and the indeterminate meter becomes a real one.
 */
export default function HandoffView({ topic, paperCount }: { topic: string; paperCount: number }) {
  return (
    <main className="wrap" id="main">
      <div className="run-head">
        <span>Starting the run</span>
        <span className="job">Handing off to a worker</span>
      </div>
      <h1 className="run-title">{topic}</h1>
      <p className="run-sub">
        Up to {paperCount} papers · the worker is picking this up now; the log will start reporting in a moment
      </p>

      {/* Not a progressbar: there is no value yet, and announcing 0% would be a
          claim about the run rather than about this page. `role="status"` with the
          sentence below is the honest version. */}
      <div className="meter meter-sweep" aria-hidden="true">
        <span />
      </div>
      <div className="meter-legend">
        <span>Queued</span>
        <span>—</span>
      </div>

      <div className="run-cols">
        <div className="run-left">
          <p className="handoff-note" role="status">
            <span className="blink" aria-hidden="true">
              ▌
            </span>
            Waiting for the worker to accept the job…
          </p>
        </div>

        <Blueprint className="run-right">
          <div className="panel-head">
            <span className="panel-label">Papers admitted</span>
            <span className="meta">0</span>
          </div>
          <PaperSkeleton />
        </Blueprint>
      </div>
    </main>
  );
}
