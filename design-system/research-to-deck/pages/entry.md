# Page Override — Entry (`src/components/EntryView.tsx`)

> Overrides `../MASTER.md` for this page only. Anything not stated here follows MASTER.

**Role:** the marketing surface *and* the job sheet. It has to sell the audit trail and
take the order in the same scroll.

## Deviations from MASTER

| Rule | MASTER | Here | Why |
|---|---|---|---|
| Display scale | `h1` 42px | `.hero-title` `clamp(50px, 6.8vw, 92px)`, uppercase, `-0.052em` left bleed | The title block of a drawing sheet; the optical left edge must align to the grid |
| Shadow | Hairlines only | `--shadow-sm` on the job-sheet `<Blueprint>` | The one permitted shadow — lifts the form off the gridded `.plate` |
| Ground | Flat `--color-bg` | `.plate` carries a 34px repeating grid at 12% accent | The blueprint substrate; hero only |
| Input size | `.input` | `.topic-input` at 56px / 17px / `--font-heading` | The topic is the single most important field on the site |
| Type floor | 12px | 9px inside the sample-slide mock | It is a *depiction* of a deck, not copy — so it carries `aria-hidden="true"`, like the hero photograph's empty `alt`. The caption beneath says what it is. Nothing outside that block may claim this. |

## Section order (fixed)

`.plate` hero + job sheet → `.steps` (3) → run spec sheet (`#how`) → outputs →
verifiability, reversed (`#verifiability`) → FAQ → reversed CTA → footer.

CTA placement is **above the fold** — the job sheet sits inside the hero, not below it.
The closing `.btn-invert` is a jump link back to `#topic`, never a second form.

## Required on this page

- `<h1>` is `.hero-title`. Section headings are `<h2>`. No level skipped.
- The aside figure is decorative: `alt=""`, `priority`, explicit `width`/`height` +
  `aspect-ratio` so it cannot shift layout.
- **Fix:** `Papers to read` is a radio group — `<fieldset>` + `<legend>`, not a bare
  `<label>` (it currently has no `for`).
- **Fix:** the email field needs persistent helper text, not a placeholder alone:
  *"We send the .pptx when the run finishes. Optional."*
- **Fix:** `.form-error` needs `role="alert"`; on submit failure move focus to the first
  invalid field.
- Signed-out state swaps the submit for a `SignInButton` that **preserves the typed
  topic**. The submit note changes with it. Never hide the form behind auth.
- `signedIn === undefined` (Clerk still loading) renders a disabled neutral button — never
  flash "Sign in" at an already-signed-in user.

## Done (Phase 1–2)

- The 10 raw `#f2f2f3` literals in the sample-slide and verifiability blocks are now
  `var(--color-bg)`; the ESLint gate that forbids their return is live.
- `Papers to read` is a `<fieldset>`/`<legend>`; the email field has persistent helper
  text wired through `aria-describedby` and an `autocomplete` hint.
- `.form-error` is `role="alert"` and takes focus on submit failure.
- The skip link lands on `<main id="main">`.
