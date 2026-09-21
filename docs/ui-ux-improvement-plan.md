# Research-to-Deck — UI/UX Improvement Plan

Produced with the **UI/UX Pro Max** skill (design-system generator + `ux` / `style` domain
rules). Scope: `src/app/globals.css`, `src/app/page.tsx`, `src/components/*`. No pipeline,
API or worker changes.

---

## 0. The decision up front: keep "Industry", don't replace it

Running the generator for this product type returns:

| Dimension | Generator says | Verdict |
|---|---|---|
| Pattern | Data-Dense + Drill-Down | **Adopt** — this is exactly what the Running/Result views are |
| Style | Data-Dense Dashboard | Partially adopt (density, tabular figures, row hover) |
| Palette | `#1E40AF` / `#3B82F6` / amber `#F59E0B` on `#F8FAFC` | **Reject** — generic SaaS blue |
| Typography | Crimson Pro + Atkinson Hyperlegible | **Reject the swap**, borrow the legibility intent |

The repo already has a real, internally coherent system — the *Industry* blueprint
language: hairline frames with registration marks, square corners, ruled sheet headers,
condensed uppercase display type, a steel-blue accent. It is more distinctive than
anything the database would hand back, and it is already implemented as tokens
(`globals.css` lines 6–51) with a component layer built only from those tokens.

**So the plan is not "pick a design system". It is: promote what exists into a documented,
enforceable design system, then fix the places the composition violates its own rules or
fails WCAG.** The generator's contribution here is the drill-down pattern for the result
view and its accessibility checklist, not its colors.

---

## Phase 1 — Make the design system a first-class artifact (½ day)

Today the system lives only as CSS comments. Persist it so future work is checkable:

```bash
python scripts/search.py "research corpus technical editorial data-dense" \
  --design-system --persist -p "Research-to-Deck"
```

Then hand-edit the generated `design-system/MASTER.md` to describe **Industry**, not the
generator's defaults. MASTER.md must record:

- The token table as the single source of truth (colors, type, space, radius, shadow).
- Hard rules: `border-radius: 0` everywhere; every framed surface carries `<Corners />`;
  display type is condensed uppercase; body type is never uppercase.
- The anti-patterns: no emoji as structural icons, no ad-hoc hex, no per-component shadows.
- Page overrides in `design-system/pages/{entry,running,result,auth}.md`.

Add a lint gate so drift is caught, not reviewed:

- **Stylelint** with `declaration-property-value-allowed-list` for `color` /
  `background-color` → must be `var(--…)` or `color-mix(… var(--…) …)`.
- An ESLint rule (or a `grep` in CI) banning raw hex in `style={{ }}` props. There are
  currently ~14 inline `#f2f2f3` literals across `EntryView.tsx` and `ResultView.tsx`.

**Exit criteria:** `npm run lint` fails on a raw hex in a component.

---

## Phase 2 — Accessibility (CRITICAL, blocking) (1–1.5 days)

These are measured, not stylistic. Contrast ratios computed against `--color-bg #f2f2f3`:

| Token / use | Ratio | Required | Status |
|---|---|---|---|
| `--color-text` body | 14.79 : 1 | 4.5 | pass |
| `--color-neutral-700` | 5.87 : 1 | 4.5 | pass |
| `--color-accent-700` links | 5.78 : 1 | 4.5 | pass |
| **`--color-neutral-600`** (`.log time`, `.sheet-foot`, `.phase .stat`, `.fig-caption`, table `th`) | **3.82 : 1** | 4.5 | **fail** |
| **`--color-neutral-500`** (`.phase-todo`) | **2.57 : 1** | 4.5 | **fail** |
| **`.btn-primary` label on `--color-accent`** | **3.71 : 1** | 4.5 | **fail** |

### 2.1 Fix the three contrast failures

- Introduce `--color-text-muted: var(--color-neutral-700)` and repoint every
  `neutral-600` **text** use at it. Keep `neutral-600` for non-text only.
- `.phase-todo` at `neutral-700` still reads as pending only by color; distinguish
  pending phases by the `·` mark and weight as well, not by color alone
  (rule: `color-not-only`).
- `.btn-primary` background → `var(--color-accent-700)` (`#416180`, **5.78 : 1** against
  `--color-bg` text). Hover/active step to `accent-800` / `accent-900`. The accent stays
  `#5980a6` for rules, meters and dots, where 3 : 1 is the bar and it passes at 3.71.

### 2.2 Type size floor

Body is `15px`; several functional strings sit at `10–12px`
(`.field > label` 10px, `.log-detail` 11px, `.fig-caption` 10px, `.slide-foot` 10px).
Set a floor of **12px for any text the user must read**, and **16px for form inputs on
mobile** — `.input` is `14px`, which triggers iOS auto-zoom on focus.

### 2.3 Live regions and status semantics

`RunningView` is a long-running async screen with no screen-reader output at all.

- `.meter` → `role="progressbar"` with `aria-valuenow={job.progress}` /
  `aria-valuemin={0}` / `aria-valuemax={100}` / `aria-label="Run progress"`.
- The activity log `<ol className="log">` → `role="log"` `aria-live="polite"`, plus
  `tabIndex={0}` so keyboard users can scroll it (it is a
  `max-height: 300px; overflow-y: auto` region with no keyboard access today — WCAG 2.1.1).
- `.form-error` → `role="alert"`, and move focus to the first invalid field on submit
  failure (`focus-management`).
- Phase list → `<ol>` with `aria-current="step"` on the active phase.

### 2.4 Structure

- Add a skip link (`.skip-link`, visually hidden until `:focus-visible`) to `#main`.
- **Heading hierarchy breaks on two of three views:** `RunningView` and `ResultView`
  render `<h2>` as the top heading with no `<h1>` on the page. Promote `.run-title` and
  `.result-title` to `h1` — they keep their classes, since size is set by class, not tag.
- `Papers to read` uses a bare `<label>` with no `for`; it labels a radio group, not an
  input. Convert to `<fieldset>` + `<legend className="field-legend">`.
- Give the email field persistent helper text (`input-helper-text`), not just a
  placeholder: "We send the .pptx when the run finishes. Optional."

**Exit criteria:** axe-core clean on all three views; a keyboard-only run from topic entry
to download with no trap and no invisible focus.

---

## Phase 3 — Touch targets, layout and responsive (1 day)

| Rule | Current | Target |
|---|---|---|
| `touch-target-size` | `.btn` ≈ 35px, `.input` 36px, `.seg-opt` ≈ 31px | ≥ 44px min-height on all three |
| `readable-font-size` | `.input` 14px | 16px (prevents iOS zoom) |
| `viewport-units` | `.shell { min-height: 100vh }` | `100dvh` |
| `spacing-scale` | `--space-*` is 3.4 / 6.8 / 10.2 / 13.6 / 20.4 / 27.2 | Re-base to a 4pt rhythm: 4 / 8 / 12 / 16 / 24 / 32 |

The spacing re-base is the one change with wide blast radius — it shifts every padding in
the app by ≤ 0.8px per step, which is visually negligible but makes the rhythm
inspectable and lets reviewers reason in multiples of 4. Do it in one commit, alone.

Also:

- `.thumbs` is a horizontal scroller with no affordance at its right edge. Add a fading
  mask and arrow-key navigation across thumbnails (roving `tabindex`).
- Verify at **375 / 768 / 1024 / 1440**. The `.datarow` 4-column grid and `.log-line`
  3-column grid already collapse at 640px; `.run-cols` and `.result-cols` rely on
  `flex-wrap` alone and need checking at 768px, where `.result-aside` (`max-width: 340px`)
  can strand a very narrow main column.

---

## Phase 4 — Feedback, empty and error states (1 day)

The happy path is well covered; the unhappy paths are thin.

1. **Silent polling failure.** `page.tsx` swallows fetch errors and retries forever at
   1.5s. After 3 consecutive failures, surface a banner: "Lost contact with the run —
   retrying." Keep retrying, but say so (`error-clarity`, `timeout-feedback`).
2. **No skeletons.** The Running view's right panel shows a bare sentence until the first
   paper lands. Replace with 5 shimmer rows shaped like the table rows, so the layout does
   not jump when data arrives (`progressive-loading`, `content-jumping`).
3. **Submit has no success moment.** Between `submitting` and the first poll response the
   UI simply swaps views. Add a short crossfade and keep the topic visible across it.
4. **Download gives no confirmation.** After `Download .pptx`, show a toast
   (`aria-live="polite"`, auto-dismiss 4s) confirming the file.
5. **Failed-run recovery.** `job.error` renders as raw text with no next step. Pair it
   with a "Retry this topic" button that re-submits the same form state.

---

## Phase 5 — Dark mode (1 day)

`layout.tsx` declares `colorScheme: "light"` and there is no `prefers-color-scheme` block.
For a tool people run for minutes at a time on a desk, this is the highest-value
discretionary item.

Implementation per `dark-mode-pairing` / `color-dark-mode`:

- Add `@media (prefers-color-scheme: dark)` redefining only the **semantic** tokens
  (`--color-bg`, `--color-surface`, `--color-text`, `--color-divider`) plus a re-tuned
  neutral and accent ramp. Do **not** invert; use desaturated lighter tonal variants.
- The `.reverse` block (steel ground, paper type) already proves the inverted palette
  works — reuse `accent-900` as the dark surface and `accent-300` as the dark accent
  (**9.57 : 1**, verified).
- Set `colorScheme: "light dark"` and a `themeColor` per scheme.
- Re-verify all six ratios from §2 independently in dark; light-mode values do not carry
  over.

The blueprint grid (`.plate` repeating gradients) and the `.duotone` `mix-blend-mode`
overlay both need dark variants; they are the two places the style is most likely to break.

---

## Phase 6 — Motion (½ day)

Today the only motion is `width` transitions on `.meter` / `.bar-mini` and a `blink`
keyframe. `prefers-reduced-motion` is already handled correctly in `globals.css`.

- **`.meter > div` animates `width`** — a layout property. Switch to `transform: scaleX()`
  with `transform-origin: left` (`transform-performance`).
- Add motion tokens: `--dur-fast: 150ms`, `--dur: 220ms`, `--dur-slow: 320ms`,
  `--ease-out: cubic-bezier(.2,.8,.2,1)` — and use them everywhere, so the app has one
  rhythm (`motion-consistency`).
- Stagger new log lines by 30ms on entry (`stagger-sequence`), capped so a burst of 40
  events does not queue a 1.2s cascade.
- Slide thumbnails: crossfade the main slide on selection rather than swapping instantly
  (`fade-crossfade`).

---

## Sequence and effort

| Phase | What | Effort | Blocking? |
|---|---|---|---|
| 1 | Persist + lint the design system | 0.5 d | Enables the rest |
| 2 | Accessibility fixes | 1.5 d | **Yes — ship-blocking** |
| 3 | Touch targets, 4pt spacing, responsive | 1 d | No |
| 4 | Empty / error / loading states | 1 d | No |
| 5 | Dark mode | 1 d | No |
| 6 | Motion tokens | 0.5 d | No |

**Total ≈ 5.5 days.** Phases 3–6 are independent of each other and can be parallelised or
dropped individually. Phase 2 alone is the minimum responsible change.

## Verification per phase

- `npm run lint && npm run typecheck` (Phase 1 adds the stylelint gate).
- axe-core / Lighthouse accessibility ≥ 95 on `/`, the running view and the result view.
- A manual keyboard-only pass end to end.
- Screenshot diff at 375 / 768 / 1440, light and dark.
- The contrast table in §2 re-run as a script and committed as a test, so a future token
  change cannot silently reintroduce a failure.
