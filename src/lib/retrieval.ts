import { claudeJson } from "./claude";
import { getPool, toVectorLiteral } from "./db";
import { SubQueriesSchema } from "./deckSchema";
import { embed, rerank } from "./voyage";

const PER_QUERY_K = 15;
const RERANK_POOL = 45;
const FINAL_CHUNKS = 30;
const MAX_CHUNKS_PER_PAPER = 3;

export interface RetrievedChunk {
  id: number;
  paperId: string;
  page: number | null;
  content: string;
  score: number;
}

export async function generateSubQueries(topic: string): Promise<string[]> {
  const result = await claudeJson({
    system:
      "You design search queries for a retrieval system over academic paper chunks. " +
      "Each query targets a different facet of the topic so that together they cover it: " +
      "core methods, key empirical results, evaluation/benchmarks, limitations and open problems, and applications or recent trends.",
    user: `Research topic: ${topic}\n\nWrite 5 distinct search queries (each under 20 words) for this topic.`,
    schema: SubQueriesSchema,
    effort: "low",
    maxTokens: 2_000,
  });
  const queries = result.queries.map((q) => q.trim()).filter(Boolean).slice(0, 6);
  return queries.length ? queries : [topic];
}

/** Keeps at most `perPaper` chunks from any single paper so one paper can't dominate the deck. */
export function diversify<T extends { paperId: string }>(items: T[], perPaper: number, limit: number): T[] {
  const counts = new Map<string, number>();
  const out: T[] = [];
  for (const item of items) {
    const n = counts.get(item.paperId) ?? 0;
    if (n >= perPaper) continue;
    counts.set(item.paperId, n + 1);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Multi-query RAG: embed the topic + sub-queries, take top-k chunks per query (scoped to
 * this job's papers), dedupe, re-rank the pool with Voyage rerank, then diversify.
 */
export async function retrieve(jobId: string, topic: string, subQueries: string[]): Promise<RetrievedChunk[]> {
  const pool = getPool();
  const queries = [topic, ...subQueries];
  const vectors = await embed(queries, "query");

  const candidates = new Map<number, RetrievedChunk>();
  for (const vector of vectors) {
    // MATERIALIZED CTE forces an exact scan over this job's chunks; a filtered HNSW
    // scan can silently return fewer than k rows once the table holds many jobs.
    const { rows } = await pool.query<{ id: string; paper_id: string; page: number | null; content: string; score: number }>(
      `WITH scoped AS MATERIALIZED (
         SELECT c.id, c.paper_id, c.page, c.content, c.embedding
         FROM chunks c JOIN job_papers jp ON jp.paper_id = c.paper_id
         WHERE jp.job_id = $2
       )
       SELECT id, paper_id, page, content, 1 - (embedding <=> $1::vector) AS score
       FROM scoped ORDER BY embedding <=> $1::vector LIMIT $3`,
      [toVectorLiteral(vector), jobId, PER_QUERY_K],
    );
    for (const r of rows) {
      const id = Number(r.id);
      const prev = candidates.get(id);
      if (!prev || r.score > prev.score) {
        candidates.set(id, { id, paperId: r.paper_id, page: r.page, content: r.content, score: r.score });
      }
    }
  }

  const pooled = [...candidates.values()].sort((a, b) => b.score - a.score).slice(0, RERANK_POOL * 2);
  const ranked = await rerank(topic, pooled.map((c) => c.content), RERANK_POOL);
  const reranked = ranked.map((r) => ({ ...pooled[r.index], score: r.score }));
  return diversify(reranked, MAX_CHUNKS_PER_PAPER, FINAL_CHUNKS);
}
