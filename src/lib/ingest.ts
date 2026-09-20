import { chunkPages, summaryChunk, type Chunk } from "./chunk";
import { getPool, toVectorLiteral } from "./db";
import { mapWithConcurrency } from "./http";
import { fetchPdfPages } from "./pdf";
import { paperSource, searchPapers, type Paper } from "./paperSearch";
import { embed } from "./voyage";

const SEARCH_CACHE_TTL_HOURS = 24;
const PDF_CONCURRENCY = 6;

export type ContentSource = "pdf" | "abstract" | "title";

/** Paper search with a per-topic Postgres cache. */
export async function findPapers(topic: string, count: number): Promise<Paper[]> {
  const pool = getPool();
  // Provider is part of the key: switching sources must not serve the old provider's hits.
  const cacheKey = `${paperSource()}|${topic.trim().toLowerCase().replace(/\s+/g, " ")}|${count}`;
  const cached = await pool.query<{ results: Paper[] }>(
    `SELECT results FROM search_cache WHERE cache_key = $1 AND created_at > now() - make_interval(hours => $2)`,
    [cacheKey, SEARCH_CACHE_TTL_HOURS],
  );
  if (cached.rows[0]) return cached.rows[0].results;

  const papers = await searchPapers(topic, count);
  await pool.query(
    `INSERT INTO search_cache (cache_key, results) VALUES ($1, $2)
     ON CONFLICT (cache_key) DO UPDATE SET results = EXCLUDED.results, created_at = now()`,
    [cacheKey, JSON.stringify(papers)],
  );
  return papers;
}

export async function attachPapersToJob(jobId: string, papers: Paper[]): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    for (const [rank, p] of papers.entries()) {
      await client.query(
        `INSERT INTO papers (paper_id, title, authors, year, venue, abstract, citation_count, url, pdf_url, doi, arxiv_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (paper_id) DO UPDATE SET citation_count = EXCLUDED.citation_count, pdf_url = EXCLUDED.pdf_url`,
        [p.paperId, p.title, p.authors, p.year, p.venue, p.abstract, p.citationCount, p.url, p.pdfUrl, p.doi, p.arxivId],
      );
      await client.query(
        `INSERT INTO job_papers (job_id, paper_id, rank) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [jobId, p.paperId, rank + 1],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function buildChunks(paper: Paper): Promise<{ chunks: Chunk[]; source: ContentSource }> {
  const summary = summaryChunk(paper);
  if (paper.pdfUrl) {
    const pages = await fetchPdfPages(paper.pdfUrl);
    if (pages) return { chunks: [summary, ...chunkPages(pages, 1)], source: "pdf" };
  }
  // No PDF: fall back to title + abstract rather than dropping the paper.
  return { chunks: [summary], source: paper.abstract ? "abstract" : "title" };
}

async function storeChunks(paperId: string, chunks: Chunk[], embeddings: number[][], source: ContentSource) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM chunks WHERE paper_id = $1", [paperId]);
    for (const [i, c] of chunks.entries()) {
      await client.query(
        `INSERT INTO chunks (paper_id, chunk_index, page, content, embedding) VALUES ($1,$2,$3,$4,$5::vector)`,
        [paperId, c.index, c.page, c.content, toVectorLiteral(embeddings[i])],
      );
    }
    await client.query("UPDATE papers SET content_source = $2, ingested_at = now() WHERE paper_id = $1", [paperId, source]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export interface IngestStats {
  papers: number;
  pdf: number;
  abstract: number;
  titleOnly: number;
  reused: number;
  chunks: number;
}

/**
 * Reported as each paper finishes. `paper` and `source` are absent for the initial
 * call that only announces how many papers were reused from an earlier job.
 */
export interface IngestProgress {
  done: number;
  total: number;
  paper?: Paper;
  source?: ContentSource;
}

/**
 * Fetches PDFs concurrently, chunks them, embeds all new chunks in batches, and upserts
 * into pgvector. Papers already ingested by an earlier job are reused.
 */
export async function ingestPapers(papers: Paper[], onProgress: (progress: IngestProgress) => Promise<void>): Promise<IngestStats> {
  const pool = getPool();
  const existing = await pool.query<{ paper_id: string; content_source: ContentSource }>(
    `SELECT paper_id, content_source FROM papers WHERE paper_id = ANY($1) AND ingested_at IS NOT NULL`,
    [papers.map((p) => p.paperId)],
  );
  const reused = new Map(existing.rows.map((r) => [r.paper_id, r.content_source]));
  const todo = papers.filter((p) => !reused.has(p.paperId));

  let done = reused.size;
  await onProgress({ done, total: papers.length });

  const built = await mapWithConcurrency(todo, PDF_CONCURRENCY, async (paper) => {
    const result = await buildChunks(paper);
    done++;
    await onProgress({ done, total: papers.length, paper, source: result.source });
    return { paper, ...result };
  });

  // Embed everything in one batched pass (far fewer API calls than per-paper).
  const allTexts = built.flatMap((b) => b.chunks.map((c) => c.content));
  const vectors = allTexts.length ? await embed(allTexts, "document") : [];
  let offset = 0;
  for (const b of built) {
    const slice = vectors.slice(offset, offset + b.chunks.length);
    offset += b.chunks.length;
    await storeChunks(b.paper.paperId, b.chunks, slice, b.source);
  }

  const sources = [...reused.values(), ...built.map((b) => b.source)];
  const chunkCount = await pool.query<{ n: string }>(`SELECT count(*) AS n FROM chunks WHERE paper_id = ANY($1)`, [
    papers.map((p) => p.paperId),
  ]);
  return {
    papers: papers.length,
    pdf: sources.filter((s) => s === "pdf").length,
    abstract: sources.filter((s) => s === "abstract").length,
    titleOnly: sources.filter((s) => s === "title").length,
    reused: reused.size,
    chunks: Number(chunkCount.rows[0].n),
  };
}
