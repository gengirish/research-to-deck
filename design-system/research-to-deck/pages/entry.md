# Page Override — Entry (`src/components/EntryView.tsx`)

> Overrides `../MASTER.md` for this page only. Anything not stated here follows MASTER.

**Role:** take the order. It is no longer a marketing page.

## What it is

Four blocks, one column, `max-width: 760px`:

1. `.lede-block` — the `<h1>` and one paragraph.
2. `form.job-form` — topic, paper count, optional email, submit. Hairline underneath.
3. `ol.steps` — three steps, one line each.
4. `footer.site-footer`.

Nothing else. No framed surfaces, no `<Blueprint>`, no ornament of any kind.

## Deviations from MASTER

| Rule | MASTER | Here | Why |
|---|---|---|---|
| Container | 1220px | 760px (`.wrap-narrow`) | One column of prose and one form; wider hurts both |
| Display scale | `h1` 42px | `clamp(38px, 5.4vw, 64px)`, uppercase, `text-wrap: balance` | It used to draw its scale from the gridded plate behind it. Standing alone it needs less shout and a balanced measure |
| Input size | `.input` | `.topic-input` at 56px / 17px / `--font-heading` | The topic is the only field that matters |

## What was removed, and why it is not coming back

The gridded hero plate, the duotone photograph and its caption, the output-spec table,
the sample-slide mock, the run-figures sheet, the three output cards, the reversed
verifiability panel with its six-row record, the four-question FAQ, and the closing CTA.

Measured: **3,825px → 1,088px** at 1440, **6,486px → 1,525px** at 375. Forty-eight
registration marks → zero.

Every claim on those sections was true and the pipeline still keeps all of them. They
were removed because the page was arguing a case to someone who had already arrived.
If any of it needs to come back, it belongs in the README or a docs page, **not** bolted
onto the form.

The closing CTA is gone specifically because the form is above the fold. A second
"generate a deck" button that scrolls you back up to the first one is not a call to
action, it is a detour.

## Required on this page

- `<h1>` is `.hero-title`. It is the only `<h1>`.
- The form is above the fold at every supported width — the landing spec asserts this.
- `Papers to read` is a `<fieldset>`/`<legend>`; the email field carries persistent
  helper text through `aria-describedby` and an `autocomplete` hint.
- `.form-error` is `role="alert"` and takes focus on submit failure.
- The skip link lands on `<main id="main">`.
- Signed-out swaps the submit for a `SignInButton` that **preserves the typed topic**.
  `signedIn === undefined` (Clerk loading) renders a disabled neutral button — never
  flash "Sign in" at an already signed-in user.
- The header carries the brand and the account control only. The in-page anchors to
  `#how` and `#verifiability` went with the sections; the spec checks every remaining
  `href="#…"` resolves to something.

## Do not

- ❌ Add a section. The page is four blocks; that is the design, not an accident.
- ❌ Reintroduce a framed surface around the form. The hairline under it is enough.
- ❌ Put a second submit or CTA anywhere on the page.
