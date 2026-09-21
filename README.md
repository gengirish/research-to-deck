# Research-to-Deck Generator

POST a research topic → get back a branded PowerPoint deck built from 50+ papers, where every bullet cites its source paper. This is the core pipeline behind deep-research.intelliforge.tech.

**Business impact:** about 3 days of literature review becomes about 5 minutes.

## Architecture

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/architecture-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/architecture-light.png">
  <img alt="Research-to-Deck architecture: browser posts to the Next.js API on Vercel, which writes a jobs row to Postgres and enqueues on Redis; the Fly.io worker searches OpenAlex, fetches open-access PDFs, embeds and reranks with Voyage, synthesizes with Claude, and renders the deck with render_deck.py" src="docs/architecture-light.png">
</picture>

**[Open the interactive diagram →](docs/research-to-deck-architecture.html)** — a standalone HTML file
(no build step, no network) with three guided walkthroughs: *Job submission*, *RAG pipeline*, and
*Deploy split*. Clone the repo and open it in a browser, or preview it on
[htmlpreview.github.io](https://htmlpreview.github.io/). It has light/dark themes, click-to-trace paths,
and PNG/SVG export.

<details>
<summary>Mermaid source (text fallback)</summary>

```mermaid
flowchart LR
  U[Browser / curl] -->|POST /api/decks| API[Next.js API on Vercel]
  API -->|insert job| PG[(Postgres + pgvector)]
  API -->|enqueue| R[(Redis / BullMQ)]
  R --> W[Worker on Fly.io<br/>Node + Python]
  W -->|search| S2[OpenAlex API]
  W -->|fetch open-access PDFs| PDF[arXiv / publishers]
  W -->|embed + rerank| V[Voyage AI]
  W -->|sub-queries + synthesis| C[Claude API]
  W -->|python-pptx| PPTX[Branded deck]
  W -->|chunks, vectors, deck bytes| PG
  U -->|GET /api/decks/:id| API
  U -->|GET /api/decks/:id/download| API
```

</details>

| Stage | What happens |
|---|---|
| **Searching** | OpenAlex paper search (relevance-ranked, over-fetched 2×). Papers with a PDF or abstract rank ahead of title-only ones. Results are cached for 24h per topic and provider. Set `PAPER_SOURCE=semanticscholar` to switch providers. |
| **Ingesting** | Open-access PDFs are downloaded 6 at a time (max 20 MB, 30 pages) and their text extracted with `unpdf`. The references section is dropped. Text is split into ~800-token chunks with ~100 tokens of overlap, and each chunk keeps the page it starts on. **Every paper also gets a title+abstract chunk, so papers without a PDF fall back to their abstract instead of being dropped.** Chunks are embedded with `voyage-3.5` (1024 dims) and stored in pgvector. Papers already ingested are reused across jobs. |
| **Retrieving** | Claude writes 5 sub-queries that cover different angles of the topic. For the topic plus each sub-query, the worker takes the top 15 chunks by exact cosine search over this job's papers. The pooled results are deduped and re-ranked with Voyage `rerank-2.5`, and no paper contributes more than 3 of the final 30 chunks. |
| **Synthesizing** | Claude (`claude-sonnet-5`, structured JSON output) writes 8–12 slides with 3–5 bullets each, speaker notes, and citation keys for every bullet. The worker checks every citation key against the retrieved set: unknown keys are removed and bullets left without a citation are dropped. If any rule is broken, Claude gets one repair pass with the list of problems. |
| **Rendering** | `python/render_deck.py` (python-pptx) builds a 16:9 deck from `python/brand.json`: a title slide, content slides with `[n]` citation markers, speaker notes on every slide, and numbered reference slides that list only the papers actually cited. |

The finished `.pptx` is stored in the `jobs` table and served by `GET /api/decks/:id/download`, so no separate blob store is needed.

### Why the worker is not on Vercel

Vercel functions can't host a long-running BullMQ consumer or run Python inside a Node function, and a 50-paper job runs for minutes. So the Next.js app (form + API) deploys to Vercel, and the worker deploys as a container (`Dockerfile.worker`) on Fly.io (Railway or Render work the same way). Both connect to the same Postgres and Redis.

## Local setup

Prerequisites: Node 22+, Python 3.10+ with `python-pptx`, and Docker.

```bash
npm install
pip install -r python/requirements.txt
docker compose up -d                 # pgvector on :5433, Redis on :6380
cp .env.example .env.local           # then fill in the keys
npm run db:migrate
npm run dev                          # terminal 1: http://localhost:3000
npm run worker                       # terminal 2: BullMQ worker
```

### Environment variables

| Variable | Used by | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | worker | Claude sub-queries + synthesis |
| `CLAUDE_MODEL` | worker | optional, default `claude-sonnet-5` |
| `AI_GATEWAY_API_KEY` | worker | optional. Routes Claude through the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) so usage bills to Vercel; takes precedence over `ANTHROPIC_API_KEY` and prefixes the model id with `anthropic/`. Needs paid Vercel credits — the free tier returns `403 RestrictedModelsError` for every Anthropic model |
| `VOYAGE_API_KEY` | worker | embeddings + reranking |
| `PAPER_SOURCE` | worker | optional, default `openalex`. Set to `semanticscholar` to use the old provider. |
| `OPENALEX_MAILTO` | worker | recommended. A contact address, **not** an API key: it opts you into OpenAlex's polite pool (10 req/s, 100k/day) instead of the slower anonymous pool. |
| `SEMANTIC_SCHOLAR_API_KEY` | worker | only read when `PAPER_SOURCE=semanticscholar`. That provider's keyless pool answers 429 to effectively every request, which is why it is no longer the default. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | app | Clerk publishable key. Provisioned by the Clerk integration on the Vercel Marketplace |
| `CLERK_SECRET_KEY` | app | Clerk secret key, same source. The worker never needs it — it only ever reads `jobs.user_id` as an opaque string |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | app | optional, default `/sign-in` — keep in step with `src/app/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | app | optional, default `/sign-up` |
| `DATABASE_URL` | app + worker | Postgres with the `vector` extension (Neon or Supabase in prod) |
| `REDIS_URL` | app + worker | `rediss://` for TLS (e.g. Upstash) |
| `PYTHON_BIN` | worker | interpreter with python-pptx (`python3` in the Docker image) |
| `AGENTMAIL_API_KEY` | app + worker | optional. Unset disables email delivery entirely; the rest of the pipeline is unaffected |
| `AGENTMAIL_DOMAIN` | app + worker | optional, default `agentmail.to`. A verified custom domain improves deliverability |
| `AGENTMAIL_INBOX_USERNAME` | app + worker | optional, default `decks` — the system inbox is `decks@<domain>` |
| `AGENTMAIL_INBOX_ID` | app + worker | optional. Reuse an existing inbox (an address) instead of creating one. Required when the account is at its plan inbox limit |
| `AGENTMAIL_WEBHOOK_SECRET` | app | `whsec_…` Svix secret; required only for inbound email. Leave unset for outbound-only |
| `APP_BASE_URL` | app + worker | public origin for the download/status links inside emails, and the sign-up link in "no account" email replies |
| `STRIPE_SECRET_KEY` | app | optional. Unset means billing is off and runs are unlimited. Set, it turns on credits (see [Billing](#billing-stripe)) |
| `STRIPE_WEBHOOK_SECRET` | app | `whsec_…` for `POST /api/webhooks/stripe`. Required once `STRIPE_SECRET_KEY` is set, or purchases never grant credits |

## API

```bash
# create a job
curl -X POST http://localhost:3000/api/decks \
  -H "Content-Type: application/json" \
  -d '{"topic":"retrieval-augmented generation evaluation","paperCount":50}'
# -> 202 {"jobId":"…","statusUrl":"…/api/decks/…"}

# poll status (and the activity log)
curl http://localhost:3000/api/decks/<jobId>
# -> {"status":"running","stage":"ingesting","progress":34,"stats":{…},
#     "events":[{"id":7,"stage":"ingesting","level":"info","message":"[13/50] …","detail":{…},"at":"…"}],
#     "downloadUrl":null}

# only the activity since the last event you saw
curl "http://localhost:3000/api/decks/<jobId>?since=7"

# once status is "done" the response also carries the deck itself
# -> {"deck":{"title":"…","slides":[{"title":"…","bullets":[{"text":"…","refs":[1,2]}],"notes":"…"}],
#             "references":[{"n":1,"text":"Lewis et al. (2020). … https://doi.org/…"}]}}

# download when status is "done"
curl -o deck.pptx http://localhost:3000/api/decks/<jobId>/download
```

**`POST /api/decks` requires a signed-in Clerk session** and answers `401 {"error":"Sign in to
generate a deck"}` without one, because a run reads up to 100 papers and bills model usage. The
browser sends the session cookie automatically; a script needs one too, so the `curl` calls below
work as written only against a deployment with Clerk unconfigured, or with a session cookie attached.

Status and download are guarded by the job UUID *and* ownership: a job you created is visible only
to you, and a job created from an inbound email has no owner, so its UUID stays its only credential
(that is what keeps the emailed download link working). A job belonging to someone else answers
`404`, not `403`, so the endpoint never confirms that another user's job id exists.

`paperCount` is 10–100 (default 50). Stages: `queued → searching → ingesting → retrieving → synthesizing → rendering → done | failed`.

`events` is the job's activity log: one timestamped line per background step the worker
takes (each paper fetched and how it was read, the embedding pass, the sub-queries, the
synthesis repair pass, the render). `level` is `info | success | warn | error`. Pass
`?since=<last id>` to fetch only what is new, which is how the web UI streams it.

Pass an optional `email` to have the finished deck mailed to you instead of polling:

```bash
curl -X POST http://localhost:3000/api/decks   -H "Content-Type: application/json"   -d '{"topic":"retrieval-augmented generation evaluation","email":"you@example.com"}'
```

## Email (AgentMail)

Email is optional. With `AGENTMAIL_API_KEY` unset, every send is skipped and the API behaves exactly as above.

**Outbound.** When a job carries a delivery address, the worker emails the `.pptx` the moment the deck is
saved, and emails a failure notice with the pipeline error if the job fails. Decks over 4 MB are not
attached (AgentMail caps a send at 6 MB including base64 overhead) — those emails carry the download link
instead. Each job sends at most one email, claimed via `jobs.notified_at` so a BullMQ retry cannot double-send.
Delivery is best-effort: an AgentMail outage never fails a deck that rendered.

The system inbox is resolved in this order: `AGENTMAIL_INBOX_ID`, then an existing inbox at
`<username>@<domain>`, then a fresh create. It never creates blindly — AgentMail plans cap inbox count,
so on a full account a create would fail rather than return the inbox you meant to reuse.

**Inbound is opt-in.** It only runs once a webhook is registered and `AGENTMAIL_WEBHOOK_SECRET` is set;
without the secret the route returns 503 and outbound delivery is unaffected. Do not register the webhook
against an inbox that receives real mail — *every* message arriving there would start a deck job and get an
auto-reply.

**Inbound.** `POST /api/webhooks/agentmail` turns a received email into a job and replies in-thread — first
an acknowledgement, then the finished deck. The subject line is the topic (`Re:`/`Fwd:` prefixes stripped,
falling back to the first substantial body line), and a `papers: 40` line in the body sets the corpus size,
clamped to 10–100.

Register the webhook against the system inbox and copy its signing secret into `AGENTMAIL_WEBHOOK_SECRET`:

```bash
curl -X POST https://api.agentmail.to/v0/webhooks   -H "Authorization: Bearer $AGENTMAIL_API_KEY"   -H "Content-Type: application/json"   -d '{"url":"https://your-app.example.com/api/webhooks/agentmail","event_types":["message.received"]}'
```

Signatures are Svix (`svix-id` / `svix-timestamp` / `svix-signature`), verified in
[src/lib/agentmailWebhook.ts](src/lib/agentmailWebhook.ts) against the raw request body with a 5-minute
replay window. Deliveries are at-least-once, so each `event_id` is claimed in `inbound_events` before any
work happens; retries of a claimed event return `200 {"status":"duplicate"}` without queueing a second deck.

Run the whole flow end to end and save the deck to `smoke-deck.pptx`:

```bash
# SMOKE_COOKIE is the `__session=…` cookie of a signed-in browser session for this
# origin; creating and reading a job both need one.
SMOKE_COOKIE="__session=..." npm run smoke -- http://localhost:3000 "retrieval-augmented generation evaluation" 50
```

## Billing (Stripe)

Billing is optional. With `STRIPE_SECRET_KEY` unset, every run is free, and the `/billing` page
says so.

**Credits.** One credit is one deck run. A new account starts with **1 free credit**, then buys packs
through Stripe Checkout:

| Pack | Price | Per deck |
|---|---|---|
| 1 deck | $15 | $15 |
| 5 decks | $49 | $9.80 |
| 20 decks | $149 | $7.45 |

The price list is `CREDIT_PACKS` in [src/lib/billing.ts](src/lib/billing.ts) and nowhere else. Checkout uses
inline `price_data`, so no products need creating in Stripe.

- `POST /api/decks` spends the credit and creates the job **in one transaction**. It answers `402` with
  `{"error", "balance": 0, "billingUrl": "/billing"}` when the balance is empty. The balance is debited with a
  conditional `UPDATE … WHERE balance >= 1`, so concurrent runs can never overdraw it.
- A job that fails (in the worker, or because the queue was unreachable) **gets its credit back**, once,
  claimed by `jobs.credit_refunded_at`.
- `credit_ledger` records every change (`free_grant`, `purchase`, `deck`, `refund`). Its sum always equals
  the balance.
- The webhook grants credits keyed on the Checkout session id, so Stripe's redeliveries grant nothing.

**Custom branding is the paid feature.** After a first purchase, `/billing` lets an account set its deck name,
footer, three colors and a PNG/JPEG logo (≤512 KB, checked by file signature). The brand is fixed when the
job is created (`jobs.brand_user_id`) and the worker hands it to `render_deck.py` through `BRAND_CONFIG`.
Fonts and text colors stay the defaults.

**Email jobs are paid too.** With billing on, an inbound email only starts a deck if the sender's address
is a *verified* email on a Clerk account with credit. That account is charged, and the job stays ownerless so
the emailed link still works. Other senders get a reply pointing them at sign-up or `/billing`.

Set it up:

1. Stripe dashboard → Developers → Webhooks → add endpoint `https://<app>/api/webhooks/stripe` with events
   `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Copy its signing secret.
2. Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` on the **Vercel** project (the worker needs neither).
3. Run `npm run db:migrate` against production **before** deploying the app: the job routes read the columns
   added by `006_billing.sql`.

Locally: `stripe listen --forward-to localhost:3000/api/webhooks/stripe` prints a `whsec_…` to use, and
card `4242 4242 4242 4242` completes a test checkout.

| Route | Rule |
|---|---|
| `GET /api/billing` | session; balance, paid flag, packs |
| `POST /api/billing/checkout` | session; `{packId}` → `{url}` of a Checkout session |
| `GET/PUT/DELETE /api/brand` | session; `PUT` is multipart and answers `402` before a first purchase |
| `GET /api/brand/logo` | session; your own logo, for the preview |
| `POST /api/webhooks/stripe` | no session; authenticated by its Stripe signature |

## Authentication (Clerk)

Clerk is installed as a native Vercel Marketplace integration, so the two keys are provisioned onto
the project and usage bills through Vercel. `src/proxy.ts` runs `clerkMiddleware()` on every request
and deliberately protects nothing: `auth.protect()` answers a signed-out request with an opaque 404,
which is wrong for a documented JSON API, and the per-job routes have to stay reachable without a
session. The rules therefore live in the handlers:

| Route | Rule |
|---|---|
| `POST /api/decks` | needs a session; the Clerk user id is stored as `jobs.user_id` |
| `GET /api/decks/:id` | owner only; `404` otherwise |
| `GET /api/decks/:id/download` | owner only; `404` otherwise |
| `POST /api/webhooks/agentmail` | no session — authenticated by its Svix signature |

`jobs.user_id` is nullable, and NULL means *ownerless*: a job that arrived by email, or one created
before auth existed. `canAccessJob` (`src/lib/jobs.ts`) lets anyone holding the UUID read those,
which is what keeps the emailed download link and pre-existing job ids working. Widening that rule
would break inbound email; narrowing it needs the email to carry a session instead.

The worker is untouched by any of this — it never authenticates, and treats `user_id` as an opaque
string it does not read.

## Deploy

Live: **https://research-to-deck.vercel.app** (app on Vercel, worker on Fly.io).

1. **Database:** on the Vercel project, Storage → Create Database → Neon (free tier), connected to the project. That sets `DATABASE_URL`. Copy the value into `.env.local` and run `npm run db:migrate`.
2. **Redis:** Storage → Create Database → Upstash → **Redis** (not QStash or Vector), connected to the project. That sets `REDIS_URL`. Copy the `rediss://` value into `.env.local` too.
3. **Auth:** on the Vercel project, Integrations → Marketplace → **Clerk** → Install, connected to the
   project. That provisions `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` across the
   environments and bills through Vercel. `vercel integration add clerk` cannot finish this one — the
   CLI hands off to the dashboard. Then `vercel env pull .env.local` for local development.
4. **Worker:** `fly apps create research-to-deck-worker`, then stage the secrets and deploy the container from `fly.toml` / `Dockerfile.worker`:

   ```bash
   # secrets.env: DATABASE_URL, REDIS_URL, VOYAGE_API_KEY, ANTHROPIC_API_KEY,
   #              PYTHON_BIN=python3, and optionally CLAUDE_MODEL, OPENALEX_MAILTO,
   #              AGENTMAIL_API_KEY, APP_BASE_URL
   fly secrets import --app research-to-deck-worker --stage < secrets.env
   fly deploy --app research-to-deck-worker --remote-only --ha=false
   fly logs --app research-to-deck-worker        # expect: [worker] listening on queue "decks"
   ```

   `fly secrets set` restarts the machine on its own, so changing a key needs no redeploy.

5. **App:** `vercel link` then `vercel deploy --prod`. The app only needs `DATABASE_URL` and `REDIS_URL`, both injected by the two integrations; the AI keys live on the worker alone. Once the project is connected to GitHub, every push to `main` deploys.

Two things that trip people up:

- Marketplace values are stored as `sensitive` on Vercel, so `vercel env pull` returns them **empty**. Copy the connection strings out of the Neon and Upstash store pages when you need them locally or on Fly.
- The worker reads columns added by later migrations, so run `npm run db:migrate` against the production `DATABASE_URL` before deploying a worker that expects them.

### Verified production run

A 50-paper job through the live URL, end to end in **51s**:

| Metric | Value |
|---|---|
| Papers found / ingested | 50 / 50 (24 abstract-only, 1 title-only, 503 chunks) |
| Retrieved | 28 chunks from 14 papers |
| Deck | 14 slides (title + 11 content + 2 reference), speaker notes on every slide, 69 KB |
| Citations | 14 references, 0 citation issues, no repair pass needed |
| Timings | search 0.4s · retrieve 13.2s · synthesize 31.7s · render 0.8s |

Ingestion was 0s because the papers were already cached from an earlier run; a cold corpus adds a
few minutes of PDF fetching and embedding.

## Tests

```bash
npm run typecheck && npm run lint
npm test            # chunking, citations, reference numbering, provider retry/selection, webhook signatures + email bodies
npm run test:py     # python-pptx renderer: slide count, notes on every slide, citation markers, references
```

## Project layout

```
src/app/api/decks/            POST create, GET status, GET download
src/app/sign-in, sign-up/     Clerk <SignIn />/<SignUp /> inside the Industry sheet
src/proxy.ts                  clerkMiddleware() (Next 16's renamed middleware convention)
src/app/page.tsx              view state + polling (entry / running / result)
src/components/                Industry design-system UI: job sheet, run view, deck viewer
src/lib/paper.ts              provider-agnostic Paper shape + content-first selection
src/lib/paperSearch.ts        provider router (PAPER_SOURCE) + display label
src/lib/openAlex.ts           OpenAlex client (throttle, backoff, inverted-abstract rebuild)
src/lib/semanticScholar.ts    Semantic Scholar client (opt-in fallback)
src/lib/pdf.ts, chunk.ts      PDF text extraction + chunking
src/lib/ingest.ts             search cache, ingestion, pgvector upserts
src/lib/voyage.ts             embeddings + rerank
src/lib/retrieval.ts          multi-query RAG + rerank + diversity
src/lib/synthesis.ts          Claude deck synthesis + repair pass
src/lib/citations.ts          citation validation + reference numbering
src/lib/pipeline.ts           stage orchestration + timings
src/lib/email.ts              AgentMail client, system inbox, deck delivery
src/lib/emailTemplates.ts     email bodies (pure, unit tested)
src/lib/notify.ts             once-only notification claim + best-effort send
src/lib/agentmailWebhook.ts   Svix signature verification + inbound parsing
src/app/api/webhooks/         inbound AgentMail webhook
worker/index.ts               BullMQ worker
python/render_deck.py         python-pptx renderer (brand.json)
src/lib/billing.ts            credit packs, balance, charge/refund/grant (transactions)
src/lib/stripe.ts             Stripe client, Checkout params, session → purchase (app only)
src/lib/brand.ts              brand validation, storage, brand.json overlay
src/lib/clerkUsers.ts         verified-email → Clerk user, for paid email jobs
src/app/billing/              credits + brand page
src/app/api/billing, brand/   credits, checkout, brand CRUD
src/app/api/webhooks/stripe/  Stripe webhook
db/migrations/                schema (papers, chunks + HNSW, jobs, cache, email delivery, job activity log, deck json, job owner, billing)
```

### Paper search provider

Search runs against **OpenAlex** by default, which needs no API key. Passing a contact address
in `OPENALEX_MAILTO` puts requests in OpenAlex's *polite pool* (10 req/s, 100k/day); without it
you still get service, just from a slower shared pool.

```bash
fly secrets set OPENALEX_MAILTO=you@example.com --app research-to-deck-worker
```

Semantic Scholar was the original provider and is still selectable, but its unauthenticated
pool returns `429` on effectively every call, so a keyless job sits in backoff and fails at the
`searching` stage. Their key is behind a manual approval queue. To use it anyway:

```bash
fly secrets set PAPER_SOURCE=semanticscholar SEMANTIC_SCHOLAR_API_KEY=... --app research-to-deck-worker
```

Both providers normalise into the same `Paper` shape (`src/lib/paper.ts`), so the rest of the
pipeline is unchanged. Two OpenAlex-specific notes: abstracts arrive as an inverted index and are
rebuilt by `reconstructAbstract()`, and there is no fulltext — the PDF-or-abstract fallback in
`selectPapers()` covers works with no open-access copy. On a 50-paper run for
"retrieval augmented generation evaluation", OpenAlex returned 50/50 usable papers
(40 with a PDF, 49 with an abstract, 0 title-only) in about 5s.
