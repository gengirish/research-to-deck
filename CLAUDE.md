# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                    # Next.js app on :3000 (form + API)
npm run worker                 # BullMQ consumer — the app does no pipeline work without it
docker compose up -d           # local pgvector on :5433, Redis on :6380
npm run db:migrate             # apply db/migrations/*.sql (idempotent, safe to re-run)

npm run typecheck && npm run lint
npm test                       # vitest, tests/**/*.test.ts
npx vitest run tests/chunk.test.ts            # single file
npx vitest run -t "reference numbering"       # single test by name
npm run test:py                # unittest over python/test_*.py (needs python-pptx)
python -m unittest python.test_render_deck.ClassName.test_name   # single python test
npm run test:e2e               # playwright, tests/e2e/specs/**; builds and starts the app itself
npm run test:e2e -- specs/result-deck.spec.ts    # single file
npm run test:e2e:ui            # watch mode; test:e2e:report opens the last HTML report

SMOKE_COOKIE="__session=…" npm run smoke -- http://localhost:3000 "some topic" 50   # end-to-end; the cookie is required now that runs need a session

# deploy (see README "Deploy" for first-time setup)
fly deploy --app research-to-deck-worker --remote-only --ha=false
fly logs --app research-to-deck-worker                   # [worker] listening on queue "decks"
fly secrets set KEY=value --app research-to-deck-worker  # restarts the machine, no redeploy needed
vercel deploy --prod                                     # app; a push to main also deploys
```

Both `dev` and `worker` need `.env.local` (see `.env.example` and the env table in README.md).

## Architecture

`POST /api/decks` only writes a `jobs` row and enqueues a BullMQ job; everything expensive runs in
`worker/index.ts` → `src/lib/pipeline.ts`. The app and the worker share `src/lib/*` and the same
Postgres + Redis, but deploy separately: **app → Vercel, worker → a container (`Dockerfile.worker`)
on Fly.io** (Railway or Render work the same way), because a 50-paper job runs for minutes and shells
out to Python. Never move pipeline work into a route handler.

Live deployment: app at https://research-to-deck.vercel.app (auto-deploys on push to `main`), worker
as Fly app `research-to-deck-worker`, Neon Postgres and Upstash Redis provisioned through the Vercel
Marketplace. Marketplace env values are `sensitive`, so `vercel env pull` returns them empty — copy
connection strings from the store pages instead.

`runDeckJob` is the single source of truth for stages (`searching → ingesting → retrieving →
synthesizing → rendering → done`), progress percentages, and the `stats`/`timings` JSON. Any new
stage belongs there plus in the `JobStage` union in `src/lib/jobs.ts` and the migration comment.

Data model (`db/migrations/001_init.sql`): `papers` + `chunks` are **global and reused across jobs**
(the ingestion cache — re-ingesting a paper is a no-op), while `job_papers` scopes a job's retrieval
set. The finished `.pptx` lives in `jobs.deck` (BYTEA), so there is no blob store; the download route
streams it straight out.

### Invariants worth preserving

- **Citation contract.** Claude may only cite `P1…Pn` keys from the retrieved set. `validateDeck`
  (`src/lib/citations.ts`) strips unknown keys, drops uncited bullets, and returns an `issues` list;
  `synthesizeDeck` then gives Claude exactly one repair pass and keeps whichever draft needed fewer
  fixes. A bullet without a valid citation must never reach the deck.
- **Auth boundary.** `POST /api/decks` requires a Clerk session and stamps `jobs.user_id`; the status
  and download routes call `canAccessJob` and answer `404` (never `403`) for someone else's job. A
  NULL `user_id` means an ownerless job — email-originated or pre-auth — readable by whoever holds the
  UUID, which is what keeps the emailed download link alive. `src/proxy.ts` (Next 16's renamed
  middleware convention; Clerk 7 supports it) only establishes the session, it protects no route,
  because `auth.protect()` would answer the JSON API with an opaque 404. The AgentMail webhook is
  authenticated by its Svix signature, not by Clerk, and the worker never authenticates at all.
- **Count limits** (8–12 slides, 3–5 bullets) live in `DECK_RULES`, not in the Zod schema — the
  schema stays loose so a near-miss can be repaired instead of rejected. Change them in one place.
- **Retrieval scoping.** The vector query in `src/lib/retrieval.ts` uses a `MATERIALIZED` CTE to force
  an exact scan over the job's chunks; a filtered HNSW scan silently returns fewer than k rows once
  the table is large. Keep the CTE. `diversify` caps any one paper at 3 of the final 30 chunks.
- **Embeddings are `voyage-3.5` at 1024 dims**, hard-coded in the `vector(1024)` column. Switching
  models needs a migration, not just a constant.
- **Every paper gets a title+abstract chunk**, so papers without an open-access PDF degrade to
  abstract-only rather than disappearing (`content_source` records which).
- **Reference numbers are assigned in order of first appearance** in `toRenderDeck`, and only cited
  papers appear on the reference slides.

### E2E tests

`tests/e2e` is Playwright and is **excluded from vitest** (`vitest.config.ts`); `npm test` and
`npm run test:e2e` are separate suites. `playwright.config.ts` runs `next build && next start` on
:3100 itself — not `next dev`, because Next 16 refuses a second dev server for a directory that
already has one. `E2E_BASE_URL` points the suite at an existing server instead.

Two seams are faked, both for reasons that will not go away: the app cannot render without a Clerk
publishable key and a signed-in session cannot be forged, so the server gets a synthetic key and the
browser a stubbed `clerk.browser.js`; and the pipeline needs a worker, Postgres, Redis and model
spend, so `/api/decks*` is intercepted and replayed from a canned timeline. `POST /api/decks`
therefore answers 401 in-browser however the stub is set — `specs/api-contract.spec.ts` asserts the
real boundary with nothing mocked. `tests/e2e/README.md` has the full rationale; read it before
loosening a locator or adding a `data-testid`.

`tests/e2e/fixtures/deckData.ts` mirrors the `GET /api/decks/[jobId]` payload. Change the route's
shape and you must change it too, or the journey specs stay green while production breaks.

### Node ↔ Python boundary

`src/lib/render.ts` spawns `$PYTHON_BIN python/render_deck.py <out.pptx>` and pipes the `RenderDeck`
JSON on stdin. That interface — the `RenderDeck` type in `src/lib/deckSchema.ts` and the JSON
`render_deck.py` reads — is the contract; change both sides together and update
`python/test_render_deck.py`. Visual styling (colors, fonts, sizes) is data in `python/brand.json`,
not code.

### Conventions

- ESM throughout (`"type": "module"`), run via `tsx`; imports inside `src/lib` are relative, route
  handlers use the `@/` alias.
- All outbound HTTP goes through `fetchWithRetry` / `mapWithConcurrency` in `src/lib/http.ts`
  (timeout, backoff, `Retry-After`). Don't call bare `fetch` for external APIs.
- Env vars are read lazily via the getters in `src/lib/env.ts` so missing keys fail with a named
  error, and `runDeckJob` checks credentials up front before minutes of downloads.
- Claude calls go through `claudeJson` (`src/lib/claude.ts`) — structured output with a Zod schema,
  explicit handling of refusal/truncation. Model comes from `CLAUDE_MODEL`, default `claude-sonnet-5`.
  Setting `AI_GATEWAY_API_KEY` swaps the client to the Vercel AI Gateway (`baseURL`) and prefixes the
  model id with `anthropic/`; unset, it calls Anthropic directly with `ANTHROPIC_API_KEY`.
- `pg`, `bullmq`, and `ioredis` are in `serverExternalPackages`; the Pool and Queue are cached on
  `globalThis` to survive dev hot reload.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
