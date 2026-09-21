# Page Override — Auth (`src/components/AuthShell.tsx`, `src/app/sign-{in,up}`)

> Overrides `../MASTER.md` for this page only. Anything not stated here follows MASTER.

**Role:** wrap Clerk's `<SignIn />` / `<SignUp />` so they read as part of the drawing
sheet rather than a third-party form dropped into it.

## The one sanctioned exception to `border-radius: 0`

Clerk's widgets ship a rounded, shadowed card. `globals.css` flattens them:

```css
.auth-panel .cl-cardBox,
.auth-panel .cl-card {
  border-radius: 0;
  box-shadow: none;
  border: 0;
  background: transparent;   /* the surrounding <Blueprint> supplies the one hairline */
}
```

But `.cl-formButtonPrimary`, `.cl-socialButtonsBlockButton` and `.cl-formFieldInput` keep
`--radius-sm` (2px) and `text-transform: none`. **This is deliberate.** Driving Clerk's
internals to a true `0` needs selectors that break on every Clerk release; 2px reads as
square at arm's length and survives upgrades. `--radius-sm` exists for exactly this.

Scope: `.auth-panel` only. Nothing outside it may claim this exemption.

## Deviations from MASTER

| Rule | MASTER | Here | Why |
|---|---|---|---|
| Container | 1220px | `.auth-wrap` 560px | A single-column form; wider is worse |
| Ground | `--color-bg` | `.auth-panel` on `--color-neutral-100` | Distinguishes the third-party surface from our own |
| Radius | `0` | 2px inside `.auth-panel` | See above |

## Required on this page

- `<h1>` is `.auth-title`. The eyebrow and its sheet number were removed with the rest
  of the ornament; the title carries the page on its own.
- The header keeps the `brand-lock` and one escape route back to `/` — a user who cannot
  get out of auth is a lost user (`escape-routes`).
- Clerk headings inherit `--font-heading`; its buttons must still clear 44px.
- Sign-in is reached **modally** from the entry page (`SignInButton mode="modal"`) so the
  typed topic survives. These standalone routes are the fallback for direct links and
  redirects, not the primary path.

## Do not

- ❌ Restyle Clerk by overriding `.cl-*` internals beyond the classes listed in
  `globals.css`. Each one is an upgrade hazard; prefer Clerk's `appearance` API.
- ❌ Add a second brand lock, marketing copy, or a nav beyond the single back link.
