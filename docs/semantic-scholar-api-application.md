# Semantic Scholar API key — application record

**Submitted:** 2026-09-20
**Form:** https://www.semanticscholar.org/product/api#api-key-form
**Applicant:** gen.girish@gmail.com
**Project:** Research-to-Deck Generator — https://research-to-deck.vercel.app
**Status:** superseded on 2026-09-20 — the project moved to OpenAlex, which needs no key.
Kept as a record of the application; Semantic Scholar remains selectable via `PAPER_SOURCE=semanticscholar`.

Why it was needed: unauthenticated Semantic Scholar search began returning `429` on
every request, which stalls deck jobs at the `searching` stage until a key is set.

## Answers as submitted

### How do you plan to use the Semantic Scholar API in your project?

Research-to-Deck is a portfolio project that turns a research topic into a cited slide deck.
A user submits a topic; the service searches Semantic Scholar for the most relevant papers,
downloads the open-access PDFs, chunks and embeds the text into a pgvector store, retrieves
the highest-signal passages with a multi-query RAG pipeline, and has an LLM draft slides in
which every bullet carries a citation key back to its source paper. The finished PowerPoint
ends with numbered reference slides listing only the papers actually cited, each with title,
authors, year, venue and link.

I use a single endpoint, `/graph/v1/paper/search`, with
`fields=paperId,title,authors,year,venue,abstract,citationCount,externalIds,openAccessPdf,url`.
`openAccessPdf` tells me which papers have retrievable full text; `abstract` is the fallback
for those that don't, so no paper is dropped for lack of a PDF. `externalIds` (DOI, arXiv)
deduplicates papers across jobs, and `authors`, `year` and `venue` populate the reference
slides. I never scrape or mirror the corpus: paper text lives in my database only as embedded
chunks used to answer the user's own query, and each deck credits Semantic Scholar as the
source of its bibliography.

Efficiency is built into the client rather than bolted on. Requests are serialized through a
process-wide throttle with a minimum 1.1-second interval, so I stay within the 1 request/second
limit even when several jobs run at once. I page at `limit=100` and over-fetch only 2× the
requested paper count, capped at 300 results, which means a typical 50-paper deck costs one or
two search calls and never more than three. Search results are cached in Postgres for 24 hours
per topic, so repeated or similar runs cost zero calls. Papers already ingested are reused
across jobs instead of being refetched. Failures back off exponentially and honour
`Retry-After`, and I request only the fields listed above rather than the full record.

### Which endpoints do you plan to use?

`/graph/v1/paper/search`

### How many requests per day do you anticipate?

Fewer than 500 per day, and typically well under 100. This is a personal portfolio and demo
project, not a consumer product: I expect on the order of 20–50 deck jobs a day, each costing
one to three search requests thanks to 100-result pages and 2× over-fetching, further reduced
by a 24-hour result cache. All requests are throttled to a maximum of one per second.

## Where each claim lives in the code

| Claim | Source |
|---|---|
| Single endpoint, field list | `src/lib/semanticScholar.ts` — `API_BASE`, `FIELDS` |
| 1.1s throttle, process-wide | `src/lib/semanticScholar.ts` — `MIN_INTERVAL_MS`, `throttle()` |
| 100-result pages, 2× over-fetch capped at 300 | `src/lib/semanticScholar.ts` — `PAGE_SIZE`, `searchPapers()` |
| Exponential backoff honouring `Retry-After` | `src/lib/http.ts` — `fetchWithRetry()` |
| 24-hour search cache | `src/lib/ingest.ts` — `SEARCH_CACHE_TTL_HOURS`, `search_cache` table |
| Abstract fallback when no PDF | `src/lib/ingest.ts`; `selectPapers()` in `semanticScholar.ts` |

If usage ever grows beyond a demo, update the volume answer before asking for a higher limit.

## Outcome

The project shipped on OpenAlex instead (no key, no approval queue), and a 50-paper run through
the live URL completed end to end in 51s. The application is left in place in case the key is
granted later: `PAPER_SOURCE=semanticscholar` switches the provider back with no code change.

## When the key arrives

```bash
cd research-to-deck
fly secrets set SEMANTIC_SCHOLAR_API_KEY=... --app research-to-deck-worker
npm run smoke -- https://research-to-deck.vercel.app "retrieval-augmented generation evaluation" 50
```

Setting the secret restarts the worker on its own. With a key the client allows 5 retries
instead of 8 and gets a dedicated ~1 req/s limit instead of the shared pool.
