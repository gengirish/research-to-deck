# Design System Master File — Industry

> **LOGIC:** When building a specific page, first check `design-system/research-to-deck/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Research-to-Deck
**System name:** Industry (minimal)
**Category:** Data-Dense + Drill-Down (research tool, not a BI dashboard)
**Source of truth:** the stylesheet layers below. This file documents those tokens; it
does not introduce new ones. If the two disagree, the CSS wins and this file is the bug.

### The layers

Imported in this order from `layout.tsx`; later layers override earlier ones at equal
specificity, which is how each can override `globals.css` without editing it.

| Layer | Owns |
|---|---|
| `globals.css` | Tokens, base elements, every component class. The light theme. |
| `theme-dark.css` | One `@media (prefers-color-scheme: dark)` block redefining tokens. |
| `motion.css` | Motion tokens; transition and animation rules. |
| `states.css` | Skeletons, toasts, empty and error states. New classes only. |

Put a change in the layer that owns it. A colour belongs in `globals.css` or
`theme-dark.css`, never inline; a transition belongs in `motion.css`, not next to the
layout rule it animates.

> **Note on provenance.** The UI/UX Pro Max generator proposed a "Data-Dense Dashboard"
> style with a `#1E40AF`/`#F59E0B` palette, Exo + Roboto Mono, 8–16px radii and drop
> shadows. That was **rejected** — see `docs/ui-ux-improvement-plan.md` §0. What was
> adopted: the Data-Dense + Drill-Down pattern, the accessibility checklist, and the
> anti-pattern list.
>
> **The drawing-sheet ornament was then removed by decision**, not by drift. Corner
> registration marks, ruled sheet heads, section eyebrows, the gridded hero plate, the
> 45° hatch and the inverted `.reverse` field are all gone, and the landing page was cut
> to a statement, the form, three steps and a footer. What remains is square corners,
> hairlines, condensed display type and whitespace. This file describes that, not what
> came before.

---

## 1. The idea in one paragraph

**Say it once, in as little as possible.** Square corners, hairline rules, condensed
uppercase display type over quiet body text, and a palette of paper and graphite with one
steel-blue accent. Separation is whitespace first and a hairline second; there are no
frames-within-frames, no marks, no captions naming a panel, no decoration of any kind.
The restraint is the argument: a tool whose whole claim is *this output is a record you
can audit* should not need to decorate itself to be believed.

The product surfaces stay dense — the run log and the deck drill-down are evidence, and
evidence is shown, not summarised. It is the **marketing** surface that is spare.

---

## 2. Global Rules

### 2.1 Color

Semantic tokens. Components reference these, never a literal.

| Role | Token | Value | Notes |
|------|-------|-------|-------|
| Page ground | `--color-bg` | `#f2f2f3` | Paper |
| Raised ground | `--color-surface` | `#e9e9ea` | |
| Body text | `--color-text` | `#1d1f20` | 14.79 : 1 on bg |
| Accent | `--color-accent` | `#5980a6` | Steel blue. **Non-text only** — see §2.2 |
| Hairline | `--color-divider` | `color-mix(in srgb, #1d1f20 16%, transparent)` | |

Neutral ramp `--color-neutral-100…900` (`#f5f5f8` → `#2b2b2d`) and accent ramp
`--color-accent-100…900` (`#eef6ff` → `#1d2d3d`) exist for tints and filled states.

### 2.1a Theme selection — Light / System / Dark

The user picks one of three; **System is the default and stores nothing**.

| Choice | `<html data-theme>` | `localStorage.theme` | Who decides |
|---|---|---|---|
| System | *(absent)* | *(absent)* | the `prefers-color-scheme` media query, live |
| Light | `light` | `light` | the user, overriding the OS |
| Dark | `dark` | `dark` | the user, overriding the OS |

How it is built, and why each piece exists:

- **The dark tokens appear twice** in `theme-dark.css` — under
  `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` for System,
  and under `:root[data-theme="dark"]` for Dark — because CSS cannot put a media query
  and an attribute selector in one selector list. Two copies of one block is only safe
  if they are provably identical, so `check-contrast.mjs` **fails the build if they
  drift**.
- **`:root[data-theme="light"] { color-scheme: light }`**. Without it, forcing Light on a
  dark OS leaves the UA free to draw form controls and scrollbars dark, because the
  `color-scheme` meta says both are supported.
- **A pre-paint script** inline in `<head>` sets `data-theme` before first paint.
  Without it a stored Dark renders light for a frame and then flashes. `<html>` carries
  `suppressHydrationWarning` for exactly that one attribute.
- **`useSyncExternalStore`**, not `useState` + `useEffect`: the preference lives in
  `localStorage`, which the server cannot see. The server renders System; React swaps in
  the real value after hydration without a mismatch.
- **The browser chrome follows a forced theme.** Next emits one `theme-color` meta per
  scheme behind a media query; a forced choice repoints them, System restores them.
- **Every storage access is guarded.** Private windows and sandboxed frames throw on
  `localStorage`; the switch still applies the theme for the view, and falls back to
  System.
- **Tabs stay in step.** A choice in one tab repaints the others via the `storage` event.

The control is `ThemeSwitch` — the existing `.seg` component as three 44×44 icon cells.
Real radios in a `<fieldset>`: one tab stop, arrow keys between options, one announced
state. The labels are visually hidden, not absent, so they are what a screen reader
reads and a translator translates.

### 2.2 Contrast law (non-negotiable)

Measured against `--color-bg`. `scripts/check-contrast.mjs` asserts this law **twice and
independently** — once for the light `:root` in `globals.css`, once for the dark block in
`theme-dark.css` — because light ratios do not carry over to a dark ground. Re-run it
after any token change.

| Pairing | Ratio | Verdict |
|---|---|---|
| `--color-text` | 14.79 : 1 | Any size |
| `--color-neutral-700` `#5d5d60` | 5.87 : 1 | **The muted-text floor** |
| `--color-accent-700` `#416180` | 5.78 : 1 | Links, and primary button ground |
| `--color-accent` `#5980a6` | 3.71 : 1 | **Non-text only** — rules, meters, dots, focus rings |
| `--color-neutral-600` `#7a7a7d` | 3.82 : 1 | **Non-text only** |
| `--color-neutral-500` `#98989b` | 2.57 : 1 | **Never for text** |

Dark clears the same law with room to spare (body 14.51, muted floor 7.95, links, the primary button
and the selected segment 9.03, accent as non-text UI 5.50). Both ramps
**run the other way round in dark** — `-100` is the quietest near-ground step and `-900`
the brightest — which is what lets every existing pairing in `globals.css` keep its
meaning without touching a component.


Rules that follow from the table:

- `--color-text-muted` is `--color-neutral-700`. **All** secondary text uses it.
  `neutral-600` and `neutral-500` are decoration tokens, not text tokens.
- The primary button's ground is `--color-accent-700`, not `--color-accent`.
- Never signal state by color alone (`color-not-only`). A pending phase, a failed run, a
  full-text vs abstract-only paper each need a mark or a word as well as a hue.

### 2.3 Typography

Fonts arrive as CSS variables from `next/font` in `layout.tsx` — there is **no
`@import`** and there must never be one (render-blocking).

| Token | Family | Use |
|---|---|---|
| `--font-heading` | Barlow Condensed 600 | Display, buttons, labels, numerals, table headers |
| `--font-body` | Barlow 400/500/700 | Everything else |

Scale: `h1 42 / h2 32 / h3 25 / h4 20 / h5 16 / h6 13`. Body 15px, line-height 1.55.
Headings `line-height: 1.12`, `letter-spacing: -0.015em`.

- **12px is the floor** for any text a user must read.
- **16px is the floor** for form inputs (below it, iOS auto-zooms on focus).
- Uppercase is for display type, eyebrows, labels and table headers only — never for prose.
- Data columns, prices, timers and counters use `font-variant-numeric: tabular-nums`.

### 2.4 Space

A 4pt rhythm for layout, over a 2pt grid for component-internal padding. The sheet was
already built on 2pt half-steps (6/10/14/18/22/26) — that is deliberate density, not
drift, so the rule is **even pixels**, with 4pt multiples for anything structural.
Odd values are what `scripts/check-spacing.mjs` rejects, across all four stylesheets.

| Token | Value |
|---|---|
| `--space-1` | `4px` |
| `--space-2` | `8px` |
| `--space-3` | `12px` |
| `--space-4` | `16px` |
| `--space-6` | `24px` |
| `--space-8` | `32px` |

Two 1px values are exempt and allowlisted in the checker, because neither is spacing:
`.vh`'s `margin: -1px` (the clip pattern needs it) and `.faq-grid`'s `gap: 1px` (a
hairline divider drawn with grid gap over a coloured ground).

Section rhythm above that: `40 / 68 / 72px`. Page gutter `28px`, `16px` under 640px.
Container `max-width: 1220px`. Page height is `100dvh`, never `100vh`.

**Breakpoints and wrap thresholds.** Verified at 375 / 667&nbsp;landscape / 768 / 1024 /
1440. Two-column rows wrap by flex-basis rather than by media query, so the basis values
decide *when* a column drops, not just how wide it is: `.result-main` at `560px` against
`.result-aside` at `300px` keeps the 16:9 slide full-width until ~900px. The header wraps
the brand onto its own row under 640px — with brand, three anchors, a badge and the auth
control it cannot fit 375px on one line.

### 2.5 Shape and elevation

- **`border-radius: 0`. Everywhere. No exceptions.** This is the single most load-bearing
  rule in the system; `--radius-sm/md/lg` exist only to flatten third-party widgets
  (Clerk) that refuse `0`.
- Separation is **whitespace first, a 1px hairline second**, and never a shadow.
  `--shadow-sm/md/lg` are defined but unused in light — keep it that way.
- **No ornament.** No registration marks, no ruled caption bars, no section eyebrows, no
  background grids or hatching. If an element's only job is to look technical, delete it.
- A framed surface is `.blueprint`: one hairline, square, nothing else. Use it for panels
  that genuinely group content — the run log, the slide, the aside — not for emphasis.

### 2.6 Motion

Defined in `motion.css`. Exits are not enters played backwards: each enter duration has a
matching exit at 60–70% of it, on an ease that starts fast.

| Enter | | Exit | | Ease |
|---|---|---|---|---|
| `--dur-fast` | `150ms` | `--dur-fast-exit` | `100ms` | `--ease-out: cubic-bezier(.2,.8,.2,1)` |
| `--dur` | `220ms` | `--dur-exit` | `150ms` | `--ease-in: cubic-bezier(.4,0,1,1)` |
| `--dur-slow` | `320ms` | `--dur-slow-exit` | `200ms` | |

The pattern: the **base** rule carries the exit timing, the `:hover`/`:focus-visible`/
`:active` rule overrides to the enter timing. That delivers exit-faster-than-enter without
a second set of selectors.

Animate `transform` and `opacity` only — there is no longer a single layout-property
animation in the app.

**`prefers-reduced-motion`** is honoured in `globals.css`, but that block zeroes
*durations* only. Anything with an `animation-delay` (the staggered log) or a press
transform needs the additive block in `motion.css` too — a delay left standing with
`animation-fill-mode: both` holds new content invisible for the length of the delay.

**Every button squeezes.** The exemption that once applied to framed buttons went with
the registration marks — nothing sits outside the border box to be dragged inward by the
scale.

---

## 3. Component Specs

These are the classes that already exist. Build from them; do not invent a parallel set.

### 3.1 Frame — `<Blueprint>` / `.blueprint`

```css
.blueprint {
  position: relative;
  border: 1px solid var(--color-divider);
  border-radius: 0;
}
```

One hairline, square, no marks. Use `<Blueprint as="section|figure|aside">` rather than
hand-rolling the markup. The landing page uses none; the run and result views use it for
the panels that group real content.

### 3.2 Panel label — `.panel-label` / `.panel-head`

What replaced the ruled sheet head and the eyebrow: a small uppercase label, optionally
with a right-aligned `.meta` count on the same baseline. No rules, no sheet numbers.

### 3.4 Buttons — `.btn`

```css
.btn {
  font-family: var(--font-heading);
  font-size: 14px;
  border: 1px solid var(--color-divider);
  border-radius: 0;
  min-height: 44px;          /* touch target — see plan Phase 3 */
  cursor: pointer;
}
.btn-primary {
  background: var(--color-accent-700);   /* 5.78:1, NOT --color-accent */
  color: var(--color-bg);
  border-color: var(--color-accent-700);
}
.btn-primary:hover:not(:disabled) { background: var(--color-accent-800); }
.btn-primary:active:not(:disabled) { background: var(--color-accent-900); }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
```

One primary CTA per screen (`primary-action`). Primary buttons carry corner marks.

### 3.5 Inputs — `.input`, `.field`, `.seg`

```css
.input {
  min-height: 44px;   /* was 36 */
  font-size: 16px;    /* was 14 — prevents iOS auto-zoom */
  background: transparent;
  border: 1px solid var(--color-divider);
  border-radius: 0;
}
.input:focus-visible { border-color: var(--color-accent); outline-offset: 0; }
```

- Every input has a **visible** `<label for>`. Placeholders are examples, never labels.
- A group of radios is a `<fieldset>` + `<legend>`, not a bare `<label>`.
- Complex fields carry persistent helper text below, not placeholder-only guidance.
- Errors render below the field, with `role="alert"`, and focus moves to the first
  invalid field on submit failure.

### 3.6 Focus

```css
:focus { outline: none; }
:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
```

`--color-accent` is 3.71 : 1 against the page — above the 3 : 1 bar for non-text UI.
Never remove the ring without a replacement of equal visibility.

### 3.7 Tables — `.table`

Header: `11px`, `0.08em`, uppercase, `--color-text-muted`, hairline under.
Rows: hairline under at 8% text, `:hover` at 4%. Numeric columns tabular.
Sortable columns must expose `aria-sort`.


---

## 4. Page Pattern

**Data-Dense + Drill-Down.** Three views, one route:

`EntryView` (statement + form) → `RunningView` (live telemetry) → `ResultView` (slide
drill-down).

The two surfaces pull opposite ways, deliberately. **Entry is spare**: a statement, the
form, three one-line steps, a footer — roughly 1,000px at desktop width, down from 3,800.
**Running and result are dense**: the run's record *is* the product's proof, so it is
shown rather than summarised. Minimalism applies to what the product *says about itself*,
not to what it *shows you*.

Page-specific deviations live in `pages/`:

- `pages/entry.md`
- `pages/running.md`
- `pages/result.md`
- `pages/auth.md`

---

## 5. Anti-Patterns (Do NOT Use)

System-specific — these break Industry:

- ❌ **Any `border-radius` other than `0`** in app CSS.
- ❌ **Reintroducing ornament** — corner marks, sheet heads, eyebrows, background grids,
  hatching. They were removed by decision; putting one back is a revert, not a flourish.
- ❌ **Raw hex in a component.** No `#f2f2f3` in a `style={{ }}` prop; use `var(--color-bg)`.
  (~14 such literals exist today in `EntryView.tsx` / `ResultView.tsx` — all are debt.)
- ❌ **A new shadow value.** Hairlines separate; shadows do not.
- ❌ **Uppercase body prose.**
- ❌ **`--color-neutral-600` / `-500` / `--color-accent` used for text.**
- ❌ **Ornate or "friendly" decoration** — rounded cards, gradients, illustration.
- ❌ **A second icon language.** One set, one stroke width.

Universal (from the generator's list, all still apply):

- ❌ Emojis as structural icons — use SVG (Lucide / Heroicons).
- ❌ Missing `cursor: pointer` on clickable elements.
- ❌ Layout-shifting hovers (animate `transform`/`opacity`, not `width`/`height`).
- ❌ Text under 4.5 : 1.
- ❌ Instant state changes with no transition.
- ❌ Invisible focus states.

---

## 6. Pre-Delivery Checklist

**Visual**

- [ ] No `border-radius` other than `0`
- [ ] No ornament reintroduced (marks, sheet heads, eyebrows, grids, hatching)
- [ ] No raw hex in any component; tokens only
- [ ] No emoji as icons; one consistent icon set
- [ ] No new shadow values

**Accessibility**

- [ ] Body text ≥ 4.5 : 1; non-text UI ≥ 3 : 1 (run `scripts/check-contrast.mjs`)
- [ ] Exactly one `<h1>` per view; no skipped heading levels
- [ ] Every input has a visible associated label; radio groups use `fieldset`/`legend`
- [ ] Async status exposed via `role="progressbar"` / `role="log"` + `aria-live`
- [ ] Errors use `role="alert"` and move focus to the offending field
- [ ] Scrollable regions are keyboard-reachable (`tabIndex={0}`)
- [ ] Focus ring visible on every interactive element
- [ ] Nothing conveyed by color alone
- [ ] `prefers-reduced-motion` respected

**Layout**

- [ ] Touch targets ≥ 44px (`.btn`, `.input`, `.seg-opt`, `.thumb`)
- [ ] Input font-size ≥ 16px
- [ ] Spacing on the 4pt rhythm
- [ ] `100dvh`, not `100vh`
- [ ] Verified at 375 / 768 / 1024 / 1440; no horizontal scroll
- [ ] No content stranded behind fixed bars

**States**

- [ ] Loading, empty, error and success states exist for every async surface
- [ ] A skeleton mirrors the real element's geometry, so data replaces a bar rather than
      replacing the layout
- [ ] Every error message carries a recovery path
- [ ] Destructive or irreversible actions confirm first
- [ ] Live regions are mounted before they have a message — one that appears with its
      content usually is not announced

**Both themes**

- [ ] Verified in light *and* dark; light values never assumed to carry over
- [ ] Checked under all three choices — System on a light OS and a dark OS, Light, Dark
- [ ] `scripts/check-contrast.mjs` passes for both
- [ ] Anything painted with a literal rather than a token will not follow the theme —
      there should be none
