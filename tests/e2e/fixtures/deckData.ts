/**
 * Canned job payloads shaped exactly like `GET /api/decks/[jobId]` returns them.
 *
 * The real pipeline reads up to 100 papers, bills Claude and Voyage, and takes
 * minutes on a worker that is not running in CI — so the UI journey is driven by
 * these instead. They are the contract between the route handler and the views;
 * if `src/app/api/decks/[jobId]/route.ts` changes shape, these must change with it
 * and the journey specs fail loudly until they do.
 */

import type { JobEvent, JobStatus, RenderDeck } from "../../../src/components/deck";

export const JOB_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
export const OTHER_JOB_ID = "11111111-2222-3333-4444-555555555555";
export const TOPIC = "retrieval-augmented generation in enterprise search";

let eventId = 0;
const at = (offsetSeconds: number) => new Date(Date.UTC(2026, 0, 15, 9, 0, offsetSeconds)).toISOString();

function event(
  stage: string,
  message: string,
  opts: { level?: JobEvent["level"]; detail?: Record<string, unknown> | null; t?: number } = {},
): JobEvent {
  return {
    id: ++eventId,
    stage,
    level: opts.level ?? "info",
    message,
    detail: opts.detail ?? null,
    at: at(opts.t ?? eventId * 3),
  };
}

const paper = (n: number, title: string, venue: string, year: number, source: "full text" | "abstract") =>
  event("ingesting", `[${n}/4] ${title}`, { detail: { source, venue, year } });

/** Events grouped by the stage that produced them, replayed in order by the mock. */
export const QUEUED_EVENTS: JobEvent[] = [event("queued", "Request accepted and queued for a worker", { detail: { topic: TOPIC, paperCount: 50 } })];

export const SEARCHING_EVENTS: JobEvent[] = [event("searching", "Screening OpenAlex for the topic", { detail: { query: TOPIC } })];

export const INGESTING_EVENTS: JobEvent[] = [
  paper(1, "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks", "NeurIPS", 2020, "full text"),
  paper(2, "Dense Passage Retrieval for Open-Domain Question Answering", "EMNLP", 2020, "full text"),
  paper(3, "Enterprise Search at Scale: A Field Study", "SIGIR", 2023, "abstract"),
  paper(4, "Benchmarking Hybrid Retrieval in Production Systems", "CIKM", 2024, "full text"),
];

export const RETRIEVING_EVENTS: JobEvent[] = [event("retrieving", "Reranked the candidate pool", { detail: { kept: 30 } })];

export const SYNTHESIZING_EVENTS: JobEvent[] = [
  event("synthesizing", "Claude drafted the deck", { detail: { slides: 3 } }),
  event("synthesizing", "Repaired 1 unresolvable citation", { level: "warn", detail: { fixed: 1 } }),
];

export const RENDERING_EVENTS: JobEvent[] = [event("rendering", "Rendered the .pptx", { level: "success", detail: { slides: 3 } })];

export const DECK: RenderDeck = {
  title: "Retrieval-Augmented Generation in Enterprise Search",
  subtitle: "What four papers agree on, and where they part ways",
  topic: TOPIC,
  generated_on: "15 January 2026",
  stats_line: "4 papers screened · 3 read in full text · 1,284 chunks indexed · 30 passages retrieved",
  slides: [
    {
      title: "Retrieval quality outweighs model size",
      bullets: [
        { text: "Swapping a sparse retriever for a dense one moved answer accuracy more than tripling parameters did.", refs: [1, 2] },
        { text: "Gains held across three enterprise corpora rather than a single benchmark.", refs: [2] },
      ],
      notes: "Lead with the cost argument here.\nSources on this slide: [1] [2]",
    },
    {
      title: "Hybrid retrieval beats either half",
      bullets: [
        { text: "Combining BM25 with embeddings recovered documents neither method found alone.", refs: [2, 4] },
        { text: "The advantage narrows once the corpus passes ten million documents.", refs: [4] },
      ],
      notes: "Expect a question about index cost.\nSources on this slide: [2] [4]",
    },
    {
      title: "Deployment reality lags the literature",
      bullets: [{ text: "Field study teams reported latency budgets, not accuracy, as the binding constraint.", refs: [3] }],
      notes: "This is the slide that changes the room.\nSources on this slide: [3]",
    },
  ],
  references: [
    { n: 1, text: "Lewis, Perez, Piktus, et al. (2020). Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks. NeurIPS. https://doi.org/10.5555/rag2020" },
    { n: 2, text: "Karpukhin, Oguz, Min, et al. (2020). Dense Passage Retrieval for Open-Domain Question Answering. EMNLP. https://doi.org/10.18653/v1/2020.emnlp-main.550" },
    { n: 3, text: "Okafor, Silva (2023). Enterprise Search at Scale: A Field Study. SIGIR. https://doi.org/10.1145/enterprise2023" },
    { n: 4, text: "Nakamura, Weiss (2024). Benchmarking Hybrid Retrieval in Production Systems. CIKM. https://doi.org/10.1145/hybrid2024" },
  ],
};

const BASE: JobStatus = {
  jobId: JOB_ID,
  topic: TOPIC,
  status: "queued",
  stage: "queued",
  progress: 2,
  error: null,
  downloadUrl: null,
  events: [],
  deck: null,
  createdAt: at(0),
  stats: {},
};

/**
 * The stages a run walks through, in worker order. The mock serves one per poll,
 * so a journey spec sees the same sequence the real pipeline produces.
 */
export const TIMELINE: JobStatus[] = [
  { ...BASE, events: QUEUED_EVENTS },
  {
    ...BASE,
    status: "running",
    stage: "searching",
    progress: 15,
    stats: { papers_found: 4 },
    events: SEARCHING_EVENTS,
  },
  {
    ...BASE,
    status: "running",
    stage: "ingesting",
    progress: 45,
    stats: { papers_found: 4, ingest: { papers: 4, pdf: 3, abstract: 1, titleOnly: 0, reused: 0, chunks: 1284 } },
    events: INGESTING_EVENTS,
  },
  {
    ...BASE,
    status: "running",
    stage: "retrieving",
    progress: 65,
    stats: {
      papers_found: 4,
      ingest: { papers: 4, pdf: 3, abstract: 1, titleOnly: 0, reused: 0, chunks: 1284 },
      retrieved_chunks: 30,
      retrieved_papers: 4,
    },
    events: RETRIEVING_EVENTS,
  },
  {
    ...BASE,
    status: "running",
    stage: "synthesizing",
    progress: 82,
    stats: {
      papers_found: 4,
      ingest: { papers: 4, pdf: 3, abstract: 1, titleOnly: 0, reused: 0, chunks: 1284 },
      retrieved_chunks: 30,
      retrieved_papers: 4,
      slides: 3,
      citation_issues_fixed: 1,
    },
    events: SYNTHESIZING_EVENTS,
  },
  {
    ...BASE,
    status: "done",
    stage: "done",
    progress: 100,
    downloadUrl: `/api/decks/${JOB_ID}/download`,
    deck: DECK,
    stats: {
      papers_found: 4,
      ingest: { papers: 4, pdf: 3, abstract: 1, titleOnly: 0, reused: 0, chunks: 1284 },
      retrieved_chunks: 30,
      retrieved_papers: 4,
      slides: 3,
      references: 4,
      citation_issues_fixed: 1,
      timings: { search_s: 3, ingest_s: 71, retrieve_s: 6, synthesize_s: 34, render_s: 2, total_s: 116 },
    },
    events: RENDERING_EVENTS,
  },
];

/** A run that dies partway, to exercise the failed branch of RunningView. */
export const FAILURE_TIMELINE: JobStatus[] = [
  TIMELINE[0],
  TIMELINE[1],
  {
    ...BASE,
    status: "failed",
    stage: "ingesting",
    progress: 45,
    error: "OpenAlex returned no open-access PDFs for this topic",
    stats: { papers_found: 4 },
    events: [event("ingesting", "Could not reach any full text for this topic", { level: "error" })],
  },
];
