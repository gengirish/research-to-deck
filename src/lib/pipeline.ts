import { getBrand } from "./brand";
import { toRenderDeck } from "./citations";
import { env } from "./env";
import { attachPapersToJob, findPapers, ingestPapers } from "./ingest";
import { getJob, logJobEvent, saveDeck, updateJob } from "./jobs";
import { paperSourceLabel } from "./paperSearch";
import { notifyDeckReady } from "./notify";
import { renderPptx } from "./render";
import { generateSubQueries, retrieve } from "./retrieval";
import { loadSourcePapers, synthesizeDeck } from "./synthesis";

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "deck";
}

const seconds = (start: number) => Math.round((Date.now() - start) / 100) / 10;

const SOURCE_LABELS = { pdf: "full text", abstract: "abstract only", title: "title only" } as const;

/** Shortens a paper title so one activity-log line stays readable. */
function shortTitle(title: string, max = 72): string {
  return title.length > max ? `${title.slice(0, max - 1).trimEnd()}…` : title;
}

/** Runs the full topic → deck pipeline for one job, recording stage, progress, and timings. */
export async function runDeckJob(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  // Fail fast on missing credentials instead of after minutes of PDF downloads.
  void env.voyageApiKey;
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new Error("Missing required environment variable: ANTHROPIC_API_KEY");
  }
  const t0 = Date.now();
  const timings: Record<string, number> = {};
  const log = (msg: string) => console.log(`[job ${jobId.slice(0, 8)}] ${msg}`);

  await updateJob(jobId, { status: "running", stage: "searching", progress: 2 });
  await logJobEvent(jobId, "searching", `Worker picked up the job · ${job.paper_count} papers requested`, {
    detail: { topic: job.topic, paperCount: job.paper_count },
  });
  await logJobEvent(jobId, "searching", `Searching ${paperSourceLabel()} for "${job.topic}"`);
  let t = Date.now();
  const papers = await findPapers(job.topic, job.paper_count);
  if (papers.length === 0) throw new Error(`${paperSourceLabel()} returned no papers for "${job.topic}"`);
  await attachPapersToJob(jobId, papers);
  timings.search_s = seconds(t);
  log(`found ${papers.length} papers in ${timings.search_s}s`);
  const withPdf = papers.filter((p) => p.pdfUrl).length;
  await logJobEvent(
    jobId,
    "searching",
    `Found ${papers.length} papers in ${timings.search_s}s · ${withPdf} with an open-access PDF`,
    {
      level: "success",
      detail: {
        seconds: timings.search_s,
        papers: papers.slice(0, 10).map((p) => ({ title: p.title, year: p.year, venue: p.venue, citations: p.citationCount })),
      },
    },
  );

  await updateJob(jobId, { stage: "ingesting", progress: 5, stats: { papers_found: papers.length } });
  t = Date.now();
  let lastReported = 0;
  let announcedEmbedding = false;
  const ingest = await ingestPapers(papers, async ({ done, total, paper, source }) => {
    const progress = 5 + Math.floor((done / total) * 50);
    if (progress - lastReported >= 5 || done === total) {
      lastReported = progress;
      await updateJob(jobId, { progress });
    }
    if (!paper || !source) {
      if (done > 0) await logJobEvent(jobId, "ingesting", `Reusing ${done} papers already ingested by an earlier job`);
      return;
    }
    await logJobEvent(jobId, "ingesting", `[${done}/${total}] ${shortTitle(paper.title)}`, {
      level: source === "pdf" ? "info" : "warn",
      detail: { source: SOURCE_LABELS[source], year: paper.year, venue: paper.venue, url: paper.url },
    });
    if (done === total && !announcedEmbedding) {
      announcedEmbedding = true;
      await logJobEvent(jobId, "ingesting", "Embedding every chunk with voyage-3.5 and writing them to pgvector");
    }
  });
  timings.ingest_s = seconds(t);
  log(
    `ingested ${ingest.papers} papers (pdf ${ingest.pdf}, abstract ${ingest.abstract}, title-only ${ingest.titleOnly}, reused ${ingest.reused}), ${ingest.chunks} chunks in ${timings.ingest_s}s`,
  );
  await logJobEvent(
    jobId,
    "ingesting",
    `Indexed ${ingest.chunks} chunks from ${ingest.papers} papers in ${timings.ingest_s}s · ${ingest.pdf} full text, ${ingest.abstract + ingest.titleOnly} abstract only`,
    { level: "success", detail: { ...ingest, seconds: timings.ingest_s } },
  );

  await updateJob(jobId, { stage: "retrieving", progress: 58, stats: { ingest } });
  t = Date.now();
  await logJobEvent(jobId, "retrieving", "Asking Claude for sub-queries that cover the topic");
  const subQueries = await generateSubQueries(job.topic);
  await logJobEvent(jobId, "retrieving", `Fanning out ${subQueries.length + 1} vector searches, then re-ranking with Voyage`, {
    detail: { subQueries },
  });
  const chunks = await retrieve(jobId, job.topic, subQueries);
  const sources = await loadSourcePapers(chunks);
  timings.retrieve_s = seconds(t);
  log(`retrieved ${chunks.length} chunks from ${sources.length} papers in ${timings.retrieve_s}s`);
  await logJobEvent(jobId, "retrieving", `Kept the ${chunks.length} strongest chunks, spread across ${sources.length} papers`, {
    level: "success",
    detail: { seconds: timings.retrieve_s },
  });

  await updateJob(jobId, {
    stage: "synthesizing",
    progress: 65,
    stats: { sub_queries: subQueries, retrieved_chunks: chunks.length, retrieved_papers: sources.length },
  });
  t = Date.now();
  await logJobEvent(jobId, "synthesizing", `Writing slides with Claude from ${chunks.length} cited excerpts`);
  const { deck, issuesFixed, repaired } = await synthesizeDeck(job.topic, chunks, sources);
  timings.synthesize_s = seconds(t);
  log(`synthesized ${deck.slides.length} slides in ${timings.synthesize_s}s (repaired: ${repaired})`);
  if (repaired) {
    await logJobEvent(jobId, "synthesizing", "First draft failed validation, so Claude was asked to repair it", { level: "warn" });
  }
  if (issuesFixed) {
    await logJobEvent(jobId, "synthesizing", `Corrected ${issuesFixed} citation ${issuesFixed === 1 ? "issue" : "issues"}`, {
      level: "warn",
    });
  }
  await logJobEvent(jobId, "synthesizing", `Drafted ${deck.slides.length} slides in ${timings.synthesize_s}s`, {
    level: "success",
    detail: { seconds: timings.synthesize_s, titles: deck.slides.map((s) => s.title).slice(0, 20) },
  });

  await updateJob(jobId, { stage: "rendering", progress: 90 });
  t = Date.now();
  // The brand was decided when the job was created; a brand deleted since falls back to the default.
  const custom = job.brand_user_id ? await getBrand(job.brand_user_id) : null;
  await logJobEvent(
    jobId,
    "rendering",
    custom ? `Handing the deck to python-pptx with the "${custom.brand.name}" brand` : "Handing the deck to python-pptx for branded rendering",
  );
  const renderDeck = toRenderDeck(deck, sources, {
    topic: job.topic,
    generatedOn: new Date().toISOString().slice(0, 10),
    statsLine: `Synthesized from ${ingest.papers} papers (${ingest.pdf} full-text, ${ingest.abstract + ingest.titleOnly} abstract-only) via ${paperSourceLabel()}`,
  });
  const pptx = await renderPptx(renderDeck, custom);
  timings.render_s = seconds(t);
  timings.total_s = seconds(t0);

  await updateJob(jobId, {
    stats: {
      slides: renderDeck.slides.length,
      references: renderDeck.references.length,
      citation_issues_fixed: issuesFixed,
      synthesis_repaired: repaired,
      timings,
    },
  });
  const deckName = `${slugify(job.topic)}.pptx`;
  await saveDeck(jobId, pptx, deckName, renderDeck);
  log(`done in ${timings.total_s}s (${renderDeck.slides.length} slides, ${renderDeck.references.length} references)`);
  await logJobEvent(
    jobId,
    "done",
    `Deck ready in ${timings.total_s}s · ${renderDeck.slides.length} slides, ${renderDeck.references.length} references, ${Math.round(pptx.byteLength / 1024)} KB`,
    { level: "success", detail: { timings, bytes: pptx.byteLength, deckName } },
  );

  if (job.notify_email || job.reply_inbox_id) {
    await logJobEvent(jobId, "done", `Emailing the deck to ${job.notify_email ?? "the requester"}`);
  }
  await notifyDeckReady(job, pptx, deckName, {
    slides: renderDeck.slides.length,
    references: renderDeck.references.length,
    papers: ingest.papers,
  });
}
