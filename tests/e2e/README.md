# End-to-end tests

Playwright, driving the real app through a browser.

```bash
npm run test:e2e                       # everything, both projects
npm run test:e2e -- --project=chromium # desktop only
npm run test:e2e -- specs/result-deck.spec.ts
npm run test:e2e -- -g "citation"      # by test name
npm run test:e2e:ui                    # watch mode, time-travel debugging
npm run test:e2e:report                # open the last HTML report

E2E_BASE_URL=https://research-to-deck.vercel.app npm run test:e2e -- specs/api-contract.spec.ts
```

`playwright.config.ts` builds the app and starts it on :3100 itself, so a bare
`npm run test:e2e` needs nothing running. Setting `E2E_BASE_URL` skips that and
points the suite at a server you already have — but note that only
`api-contract.spec.ts` is safe against a **real** deployment; the rest expect the
stubbed auth below.

## What is faked, and why

Two things stand between a test and a green run, and each is faked at exactly one
seam.

**Clerk.** The app will not render without a publishable key — `ClerkProvider`
throws — and a signed-in browser session cannot be forged, because it needs a JWT
signed by a real Clerk instance. So the server gets a *synthetic* key whose
frontend API host (`clerk.e2e.local`) does not resolve, and the browser gets a
stubbed `clerk.browser.js` (`fixtures/clerkStub.ts`) that implements just the
surface `@clerk/react` uses: `load()`, `addListener()`, `session`, `user`,
`mount*`. A spec declares which visitor it is with `test.use({ authState:
"signed-in" })`.

Nothing here needs, or should be given, real Clerk credentials — with real keys
these tests would create real sessions.

**The deck pipeline.** A run reads up to 100 papers, embeds them, calls Claude and
shells out to Python, on a worker that is not running in CI. `fixtures/deckApi.ts`
intercepts the browser's calls to `/api/decks*` and replays a canned timeline
(`fixtures/deckData.ts`) instead; `deckApi.advance()` moves the run one stage on
and the page's own 1.5s poll notices.

## What that does and does not prove

Covered: the landing page's claims, the auth gate as a visitor meets it, form
validation and the exact payload submitted, every stage of the progress view, the
failure branch, the finished deck's citations, sources, notes and download, the
offline banner, and — with nothing mocked at all — the JSON API's auth boundary.

Not covered, by construction: completing a real sign-in, and the pipeline itself.
The worker's behaviour belongs to `npm test` (vitest), `npm run test:py`, and
`npm run smoke`, which runs the real thing end to end against a live deployment.

One consequence worth knowing: `POST /api/decks` answers **401 whatever the
browser is stubbed to believe**, because `auth()` runs on the server and sees no
session cookie. That is why the signed-in journeys mock the API, and why
`api-contract.spec.ts` asserts the real 401 directly.

## Layout

```
tests/e2e/
├── fixtures/
│   ├── clerkStub.ts   the fake clerk-js, and the URLs it is served for
│   ├── deckApi.ts     the controllable /api/decks stand-in
│   ├── deckData.ts    canned job payloads, shaped like the real route returns them
│   └── test.ts        the fixtures every spec imports
├── pages/             page objects — EntryPage, RunPage, ResultPage
└── specs/
    ├── api-contract.spec.ts   the real API, nothing mocked
    ├── auth-gating.spec.ts    signed out vs signed in
    ├── entry-form.spec.ts     validation, payload, create failures
    ├── landing.spec.ts        the marketing surface
    ├── offline-pwa.spec.ts    offline banner, manifest, fallback page
    ├── result-deck.spec.ts    the finished deck
    └── run-lifecycle.spec.ts  the progress view, stage by stage
```

The app ships no `data-testid` hooks, so the page objects locate by role, label and
visible text. A locator that breaks is usually a real accessibility regression
rather than a test that needs loosening — check before you loosen it.

`fixtures/deckData.ts` is a copy of the `GET /api/decks/[jobId]` contract. If the
route's shape changes, change it here too; otherwise these specs stay green while
production breaks.
