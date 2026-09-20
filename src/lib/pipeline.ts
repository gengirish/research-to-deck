import { toRenderDeck } from "./citations";
import { env } from "./env";
import { attachPapersToJob, findPapers, ingestPapers } from "./ingest";
import { getJob, saveDeck, updateJob } from "./jobs";
import { paperSourceLabel } from "./paperSearch";
import { notifyDeckReady } from "./notify";
import { renderPptx } from "./render";
import { generateSubQueries, retrieve } from "./retrieval";
import { loadSourcePapers, synthesizeDeck } from "./synthesis";

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "deck";
}

const seconds = (start: number) => Math.round((Date.now() - start) / 100) / 10;

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
  let t = Date.now();
  const papers = await findPapers(job.topic, job.paper_count);
  if (papers.length === 0) throw new Error(`${paperSourceLabel()} returned no papers for "${job.topic}"`);
  await attachPapersToJob(jobId, papers);
  timings.search_s = seconds(t);
  log(`found ${papers.length} papers in ${timings.search_s}s`);

  await updateJob(jobId, { stage: "ingesting", progress: 5, stats: { papers_found: papers.length } });
  t = Date.now();
  let lastReported = 0;
  const ingest = await ingestPapers(papers, async (done, total) => {
    const progress = 5 + Math.floor((done / total) * 50);
    if (progress - lastReported >= 5 || done === total) {
      lastReported = progress;
      await updateJob(jobId, { progress });
    }
  });
  timings.ingest_s = seconds(t);
  log(`ingested ${ingest.papers} papers (pdf ${ingest.pdf}, abstract ${ingest.abstract}, title-only ${ingest.titleOnly}, reused ${ingest.reused}), ${ingest.chunks} chunks in ${timings.ingest_s}s`);

  await updateJob(jobId, { stage: "retrieving", progress: 58, stats: { ingest } });
  t = Date.now();
  const subQueries = await generateSubQueries(job.topic);
  const chunks = await retrieve(jobId, job.topic, subQueries);
  const sources = await loadSourcePapers(chunks);
  timings.retrieve_s = seconds(t);
  log(`retrieved ${chunks.length} chunks from ${sources.length} papers in ${timings.retrieve_s}s`);

  await updateJob(jobId, {
    stage: "synthesizing",
    progress: 65,
    stats: { sub_queries: subQueries, retrieved_chunks: chunks.length, retrieved_papers: sources.length },
  });
  t = Date.now();
  const { deck, issuesFixed, repaired } = await synthesizeDeck(job.topic, chunks, sources);
  timings.synthesize_s = seconds(t);
  log(`synthesized ${deck.slides.length} slides in ${timings.synthesize_s}s (repaired: ${repaired})`);

  await updateJob(jobId, { stage: "rendering", progress: 90 });
  t = Date.now();
  const renderDeck = toRenderDeck(deck, sources, {
    topic: job.topic,
    generatedOn: new Date().toISOString().slice(0, 10),
    statsLine: `Synthesized from ${ingest.papers} papers (${ingest.pdf} full-text, ${ingest.abstract + ingest.titleOnly} abstract-only) via ${paperSourceLabel()}`,
  });
  const pptx = await renderPptx(renderDeck);
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
  await saveDeck(jobId, pptx, deckName);
  log(`done in ${timings.total_s}s (${renderDeck.slides.length} slides, ${renderDeck.references.length} references)`);

  await notifyDeckReady(job, pptx, deckName, {
    slides: renderDeck.slides.length,
    references: renderDeck.references.length,
    papers: ingest.papers,
  });
}
