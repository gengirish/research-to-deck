# Page Override — Running (`src/components/RunningView.tsx`)

> Overrides `../MASTER.md` for this page only. Anything not stated here follows MASTER.

**Role:** a live instrument panel for a job that runs for minutes. Its job is to make
waiting legible — and the reading log *is* the product's proof, so density beats summary.

## Deviations from MASTER

| Rule | MASTER | Here | Why |
|---|---|---|---|
| Density | Comfortable | Compact — log lines at 12px, 4px vertical padding | It is a telemetry stream, read by scanning |
| Type floor | 12px | `.log-detail` may sit at 11px **only** for key/value detail chips | Secondary to an adjacent 12px message; never the only copy of the information |
| Motion | `--dur` | `.meter` transitions over `0.4s linear` | A progress bar should track real time, not ease |

## Required on this page

- **`<h1>` is `.run-title`** (the topic). It currently renders as `<h2>` with no `<h1>`
  above it — that is a heading-hierarchy break and must be fixed.
- `.meter` → `role="progressbar"`, `aria-valuenow={job.progress}`, `aria-valuemin={0}`,
  `aria-valuemax={100}`, `aria-label="Run progress"`.
- `.meter > div` animates `transform: scaleX()` with `transform-origin: left`, **not**
  `width` (layout property — causes reflow every tick).
- The phase list is an `<ol>`; the active phase carries `aria-current="step"`.
- Phase state is never color-only: `done ✓ / active ▸ / todo · / failed ×` marks carry it.
  `.phase-todo` uses `--color-text-muted`, not `neutral-500` (2.57 : 1).
- The activity log `<ol className="log">` → `role="log"`, `aria-live="polite"`,
  `aria-relevant="additions"`, **`tabIndex={0}`**. It is a `max-height: 300px` scroll
  region with no keyboard access today (WCAG 2.1.1).
- Tail-following must stay opt-out: if the user scrolls up more than 40px from the bottom,
  stop auto-scrolling. Already implemented via the `pinned` ref — preserve it.
- New log lines stagger 30ms on entry, capped so a burst of 40 events cannot queue a
  1.2s cascade.

## Done (Phase 2)

The ornament strip replaced the log's `SheetHead` with a plain `.panel-head`; the
panels keep their hairline frame. `<h1>`, `role="progressbar"` with live `aria-valuenow`/`aria-valuetext`, the phase `<ol>`
with `aria-current="step"` and a `.vh` state word per row, the log as a focusable
`role="log"` live region, `role="alert"` on the failure message, the "lost contact"
banner, and `.meter` on `scaleX()` instead of `width`.

## States

| State | Current | Required |
|---|---|---|
| No papers yet | One sentence of prose | 5 shimmer rows shaped like the table rows, so arrival does not shift layout |
| No events yet | Blinking caret + "Waiting for the worker…" | Keep — it is correct |
| Poll failing | **Silent** — `page.tsx` swallows the error and retries forever | After 3 consecutive failures, a banner: "Lost contact with the run — retrying." Keep retrying |
| Failed | Raw `job.error` text | Pair with a **Retry this topic** button that re-submits the same form state |

## Do not

- ❌ Block leaving the page. The run continues on the worker; say so, and keep saying so.
- ❌ Collapse the log to a spinner. The log is the evidence.
