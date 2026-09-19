import { env } from "./env";
import { fetchWithRetry, HttpError } from "./http";

const API_BASE = "https://api.semanticscholar.org/graph/v1";
const FIELDS = "paperId,title,authors,year,venue,abstract,citationCount,externalIds,openAccessPdf,url";
const PAGE_SIZE = 100;
const MIN_INTERVAL_MS = 1_100; // keyed limit is ~1 req/s

export interface Paper {
  paperId: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  abstract: string | null;
  citationCount: number | null;
  url: string | null;
  pdfUrl: string | null;
  doi: string | null;
  arxivId: string | null;
}

interface RawPaper {
  paperId: string;
  title?: string | null;
  authors?: { name?: string | null }[] | null;
  year?: number | null;
  venue?: string | null;
  abstract?: string | null;
  citationCount?: number | null;
  url?: string | null;
  externalIds?: Record<string, string | number | null> | null;
  openAccessPdf?: { url?: string | null } | null;
}

let nextSlot = 0;
/** Serialises requests so we never exceed ~1 req/s across the process. */
async function throttle(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_INTERVAL_MS;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

export function normalizePaper(raw: RawPaper): Paper | null {
  const title = raw.title?.trim();
  if (!raw.paperId || !title) return null;
  const ext = raw.externalIds ?? {};
  const pdfUrl = raw.openAccessPdf?.url?.trim();
  return {
    paperId: raw.paperId,
    title,
    authors: (raw.authors ?? []).map((a) => a.name?.trim()).filter((n): n is string => Boolean(n)),
    year: raw.year ?? null,
    venue: raw.venue?.trim() || null,
    abstract: raw.abstract?.trim() || null,
    citationCount: raw.citationCount ?? null,
    url: raw.url ?? null,
    pdfUrl: pdfUrl || null,
    doi: ext.DOI ? String(ext.DOI) : null,
    arxivId: ext.ArXiv ? String(ext.ArXiv) : null,
  };
}

/**
 * Keeps Semantic Scholar's relevance order, but promotes papers that have usable
 * content (PDF or abstract) ahead of title-only ones, then takes `count`.
 */
export function selectPapers(papers: Paper[], count: number): Paper[] {
  const seen = new Set<string>();
  const unique = papers.filter((p) => !seen.has(p.paperId) && seen.add(p.paperId));
  const withContent = unique.filter((p) => p.pdfUrl || p.abstract);
  const titleOnly = unique.filter((p) => !p.pdfUrl && !p.abstract);
  return [...withContent, ...titleOnly].slice(0, count);
}

async function searchPage(query: string, offset: number): Promise<{ total: number; data: RawPaper[] }> {
  await throttle();
  const params = new URLSearchParams({ query, offset: String(offset), limit: String(PAGE_SIZE), fields: FIELDS });
  const headers: Record<string, string> = {};
  const apiKey = env.semanticScholarApiKey;
  if (apiKey) headers["x-api-key"] = apiKey;

  const res = await fetchWithRetry(`${API_BASE}/paper/search?${params}`, { headers }, { retries: apiKey ? 5 : 8, baseDelayMs: 1_500 });
  if (!res.ok) throw new HttpError(`Semantic Scholar search failed: ${res.status} ${await res.text()}`, res.status);
  const body = (await res.json()) as { total?: number; data?: RawPaper[] };
  return { total: body.total ?? 0, data: body.data ?? [] };
}

/** Fetches enough search pages to select `count` papers (over-fetches 2x to allow filtering). */
export async function searchPapers(query: string, count: number): Promise<Paper[]> {
  const target = Math.min(count * 2, 300);
  const collected: Paper[] = [];
  for (let offset = 0; offset < target; offset += PAGE_SIZE) {
    const page = await searchPage(query, offset);
    collected.push(...page.data.map(normalizePaper).filter((p): p is Paper => p !== null));
    if (page.data.length < PAGE_SIZE || offset + PAGE_SIZE >= page.total) break;
  }
  return selectPapers(collected, count);
}
