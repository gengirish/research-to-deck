import { stripControlChars } from "./chunk";
import { env } from "./env";
import { fetchWithRetry, HttpError } from "./http";

const API_BASE = "https://api.voyageai.com/v1";
export const EMBEDDING_MODEL = "voyage-3.5";
export const EMBEDDING_DIM = 1024;
export const RERANK_MODEL = "rerank-2.5";
const EMBED_BATCH = 64;

/**
 * Last line of defence before text leaves the process: one lone surrogate anywhere in a
 * batch is invalid UTF-8 and fails the whole request with a 400, whatever its origin
 * (PDF text, provider metadata, a Claude-written sub-query). An empty string is also
 * rejected, so a text reduced to nothing becomes a single space.
 */
const voyageText = (s: string) => stripControlChars(s) || " ";

async function voyagePost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetchWithRetry(
    `${API_BASE}${path}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${env.voyageApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { retries: 4, timeoutMs: 60_000 },
  );
  if (!res.ok) throw new HttpError(`Voyage ${path} failed: ${res.status} ${await res.text()}`, res.status);
  return (await res.json()) as T;
}

export async function embed(texts: string[], inputType: "document" | "query"): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    const res = await voyagePost<{ data: { embedding: number[]; index: number }[] }>("/embeddings", {
      input: batch.map(voyageText),
      model: EMBEDDING_MODEL,
      input_type: inputType,
      output_dimension: EMBEDDING_DIM,
    });
    const ordered = [...res.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
    out.push(...ordered);
  }
  return out;
}

/** Returns document indices ordered by relevance to the query. */
export async function rerank(query: string, documents: string[], topK: number): Promise<{ index: number; score: number }[]> {
  if (documents.length === 0) return [];
  const res = await voyagePost<{ data: { index: number; relevance_score: number }[] }>("/rerank", {
    query: voyageText(query),
    documents: documents.map(voyageText),
    model: RERANK_MODEL,
    top_k: Math.min(topK, documents.length),
  });
  return res.data.map((d) => ({ index: d.index, score: d.relevance_score }));
}
