# Design System Master File — Industry

> **LOGIC:** When building a specific page, first check `design-system/research-to-deck/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Research-to-Deck
**System name:** Industry (blueprint / drawing-sheet language)
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
> shadows. That was **rejected** — the app already has a stronger, coherent system. What
> was adopted from the generator: the Data-Dense + Drill-Down page pattern, the
> accessibility checklist, and the anti-pattern list. See
> `docs/ui-ux-improvement-plan.md` §0.

---

## 1. The idea in one paragraph

Every surface is a **wireframe object on a drawing sheet**: square, hairline-bordered,
carrying registration marks at its corners and a ruled caption bar naming it. Display type
is condensed and uppercase, like a drawing title block. Body type is never uppercase. The
palette is paper and graphite with one steel-blue accent. Nothing is rounded, nothing
floats, nothing is decorative. The aesthetic exists to say: *this output is a record you
can audit*, which is the product's entire claim.

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
`--color-accent-100…900` (`#eef6ff` → `#1d2d3d`) exist for tints and the reversed field.

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
| `--color-accent-300` on `--color-accent-900` | 9.57 : 1 | The reversed field |

Dark clears the same law with room to spare (body 14.51, muted floor 7.95, links and the
primary button 9.03, accent as non-text UI 5.50, reversed field 10.22 / 6.62). Both ramps
**run the other way round in dark** — `-100` is the quietest near-ground step and `-900`
the brightest — which is what lets every existing pairing in `globals.css` keep its
meaning without touching a component.

`.reverse` is the exception: it is an inverted island whose children hard-code paper
tints, so flipping the ramp globally would collapse it to ~1.1 : 1. In dark it carries
**local copies** of the four tokens it paints with. No `globals.css` declaration is
overridden; the same `var()`s just resolve differently inside the island.

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
- Separation is a **1px hairline**, not a shadow. `--shadow-sm` is permitted once, on the
  job-sheet form, to lift it off the gridded plate. `--shadow-md` / `--shadow-lg` are
  defined but unused — keep it that way.
- Every framed surface renders `<Corners />` (the four `+` registration marks). A framed
  element never drops its marks.

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

**Framed buttons do not squeeze.** `.btn.blueprint` is excluded from press scaling: its
`<i class="corner">` marks sit `-6px` outside the border box, so scaling drags them
inward and no child counter-scale can undo it. Framed buttons get colour-only press
feedback until the marks move outside the scaled box.

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

Children: four `<i class="corner tl|tr|bl|br">` marks, supplied by `<Corners />`.
Use `<Blueprint as="section|figure|aside">` rather than hand-rolling the markup.

### 3.2 Sheet head — `<SheetHead title marks={[]}>`

The ruled caption bar that titles a framed panel. First cell flexes; each `mark` is a
right-aligned cell separated by a hairline. Uppercase, `--font-heading`, `0.12em` tracking.

### 3.3 Eyebrow — `<Eyebrow label sheet>`

Section label · hairline fill · optional sheet number. `12px`, `0.18em`, uppercase,
`--color-accent-700`.

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

### 3.8 Reversed field — `.reverse`

`--color-accent-900` ground, `--color-bg` type, `--color-accent-300` accents. Used for the
verifiability section and the closing CTA. Optional `.hatch` 45° hairline texture. Contrast
inside the reversed field is verified separately — light-mode values do not carry over.

---

## 4. Page Pattern

**Data-Dense + Drill-Down.** Three views, one route:

`EntryView` (marketing + job sheet) → `RunningView` (live telemetry) → `ResultView`
(slide drill-down). The primary CTA sits above the fold in the job sheet. Density is a
feature: the run's record *is* the product's proof, so show it rather than summarise it.

Page-specific deviations live in `pages/`:

- `pages/entry.md`
- `pages/running.md`
- `pages/result.md`
- `pages/auth.md`

---

## 5. Anti-Patterns (Do NOT Use)

System-specific — these break Industry:

- ❌ **Any `border-radius` other than `0`** in app CSS.
- ❌ **A framed surface without corner marks.** Use `<Blueprint>`.
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
- [ ] Every framed surface renders `<Corners />`
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
- [ ] `scripts/check-contrast.mjs` passes for both
- [ ] Anything painted with a literal rather than a token will not follow the theme —
      there should be none
