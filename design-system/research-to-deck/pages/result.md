# Page Override — Result (`src/components/ResultView.tsx`)

> Overrides `../MASTER.md` for this page only. Anything not stated here follows MASTER.

**Role:** the drill-down. A thumbnail rail selects a slide; the main column renders it at
16:9; the aside proves it. This is where the Data-Dense + Drill-Down pattern actually
lives.

## Deviations from MASTER

| Rule | MASTER | Here | Why |
|---|---|---|---|
| Type scale | Fixed steps | `.slide` scales fluidly (`clamp`) on title, bullets, padding, dot offset | The slide preview is a **scale model** of the .pptx — proportions must hold at any width, so every dimension inside it scales together |
| Type floor | 12px | `.slide-foot` at 10px | It mirrors a footer that is genuinely small in the rendered deck; the same citations appear at readable size in the aside |
| Density | Comfortable | `.thumb` 148px wide, 2-line clamped title | A rail, scanned not read |

## Required on this page

- **`<h1>` is `.result-title`** (the deck title). Currently `<h2>` with no `<h1>` — fix.
  The slide's own title stays `<h3>`: it is content being previewed, not page structure.
- `.thumbs` is a `role="tablist"` with a roving `tabindex`: one tab stop, arrows/Home/End
  move within it, and focus follows only a *keyboard* move, never a click. The rail fades
  at its right edge while there is more to scroll to — `--more` is set from the scroll
  position, so the affordance disappears when the rail is at its end.
- Selecting a thumbnail crossfades the main slide over `--dur`; it must not swap instantly
  and must not shift layout.
- `.bar-mini` coverage meter: `transform: scaleX()`, not `width`. Its label ("Coverage vs.
  best slide", `{coverage}%`) is visible text — keep it; the bar alone is not accessible.
- Citation markers `[n]` in bullets are `--color-accent-700` (5.78 : 1) and
  `white-space: nowrap` so a reference never wraps away from its clause.
- Reference links open in a new tab with `rel="noreferrer"`, and show the bare host+path,
  never a raw `https://`.

## States

| State | Required |
|---|---|
| Slide cites nothing | `.slide-foot` says "No citations on this slide"; the aside says it too. **Never render an empty panel.** |
| Download | Confirm with a toast (`aria-live="polite"`, auto-dismiss 4s). Today the click gives no feedback at all. |
| New run | `New run` is `.btn-secondary`, visually subordinate to `Download .pptx`. One primary CTA per screen. |

## Do not

- ❌ Render the slide preview as an image. It is live DOM so it stays selectable,
  translatable and screen-reader legible — the same reason the .pptx uses real text boxes.
- ❌ Lower `.result-main`'s flex-basis below `560px`. It is what makes the aside wrap at
  768px; at the old `420px` both columns shared the row and the slide rendered at 427px.

## After the ornament strip

The slide and the asides keep their `.blueprint` hairline frame — they group real
content, which is what a frame is now for. What they lost is the corner marks and the
inline ones on the download link.

## Known gaps

- **Clerk is not themed.** `.cl-*` ships its own light palette, so `/sign-in`, `/sign-up`
  and the header avatar stay a light card on the dark sheet. Fixing it means a Clerk
  `appearance` prop on `ClerkProvider` — a component decision, not a token one. See
  `auth.md`.
- **Log stagger is by absolute position, not per burst.** `motion.css` caps the delay at
  8 lines × 30ms, so a burst of 40 can never cascade for a second — but a burst arriving
  mid-run fades in together rather than cascading. Per-burst timing needs the component
  to pass an index (`style={{ "--log-i": i }}`) that CSS can read.
