import { env } from "./env";
import { fetchWithRetry, HttpError } from "./http";
import { selectPapers, type Paper } from "./paper";

const API_BASE = "https://api.openalex.org";
// Trimming the payload with `select` keeps 100-result pages small; inverted abstracts are bulky.
const SELECT = [
  "id",
  "doi",
  "display_name",
  "publication_year",
  "authorships",
  "primary_location",
  "best_oa_location",
  "open_access",
  "cited_by_count",
  "abstract_inverted_index",
].join(",");
const PAGE_SIZE = 100;
// Polite pool (a `mailto` on every request) allows 10 req/s; 150ms leaves headroom.
const MIN_INTERVAL_MS = 150;

interface RawAuthorship {
  author?: { display_name?: string | null } | null;
  raw_author_name?: string | null;
}

interface RawLocation {
  pdf_url?: string | null;
  landing_page_url?: string | null;
  source?: { display_name?: string | null } | null;
}

export interface RawWork {
  id?: string | null;
  doi?: string | null;
  display_name?: string | null;
  title?: string | null;
  publication_year?: number | null;
  authorships?: RawAuthorship[] | null;
  primary_location?: RawLocation | null;
  best_oa_location?: RawLocation | null;
  open_access?: { oa_url?: string | null } | null;
  cited_by_count?: number | null;
  abstract_inverted_index?: Record<string, number[]> | null;
}

let nextSlot = 0;
/** Serialises requests so we stay inside the polite-pool rate limit across the process. */
async function throttle(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_INTERVAL_MS;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

/**
 * OpenAlex ships abstracts as {word: [positions]} rather than text (a licensing artefact).
 * Rebuild the original word order; gaps are possible, so we skip empty slots.
 */
export function reconstructAbstract(index: Record<string, number[]> | null | undefined): string | null {
  if (!index) return null;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const pos of positions) {
      if (Number.isInteger(pos) && pos >= 0) words[pos] = word;
    }
  }
  const text = words.filter((w) => w !== undefined).join(" ").trim();
  return text || null;
}

/** "https://openalex.org/W123" -> "W123"; ids are already unique across providers. */
function shortId(id: string): string {
  return id.replace(/^https?:\/\/openalex\.org\//i, "").trim();
}

function arxivIdFrom(locations: (RawLocation | null | undefined)[]): string | null {
  for (const loc of locations) {
    for (const url of [loc?.pdf_url, loc?.landing_page_url]) {
      const match = url && /arxiv\.org\/(?:abs|pdf)\/([^?#\s]+?)(?:v\d+)?(?:\.pdf)?$/i.exec(url);
      if (match) return match[1];
    }
  }
  return null;
}

export function normalizeWork(raw: RawWork): Paper | null {
  const id = raw.id?.trim();
  const title = (raw.display_name ?? raw.title)?.trim();
  if (!id || !title) return null;

  const locations = [raw.best_oa_location, raw.primary_location];
  const arxivId = arxivIdFrom(locations);
  const oaUrl = raw.open_access?.oa_url?.trim();
  const pdfUrl =
    raw.best_oa_location?.pdf_url?.trim() ||
    raw.primary_location?.pdf_url?.trim() ||
    (oaUrl?.endsWith(".pdf") ? oaUrl : "") ||
    // OpenAlex often lists only the arXiv landing page; the PDF is one URL away.
    (arxivId ? `https://arxiv.org/pdf/${arxivId}` : "");

  const doi = raw.doi?.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "") || null;
  const landing = raw.primary_location?.landing_page_url?.trim() || raw.best_oa_location?.landing_page_url?.trim();

  return {
    paperId: shortId(id),
    title,
    authors: (raw.authorships ?? [])
      .map((a) => (a.author?.display_name ?? a.raw_author_name)?.trim())
      .filter((n): n is string => Boolean(n)),
    year: raw.publication_year ?? null,
    venue:
      raw.primary_location?.source?.display_name?.trim() ||
      raw.best_oa_location?.source?.display_name?.trim() ||
      null,
    abstract: reconstructAbstract(raw.abstract_inverted_index),
    citationCount: raw.cited_by_count ?? null,
    url: (doi ? `https://doi.org/${doi}` : landing) || id,
    pdfUrl: pdfUrl || null,
    doi,
    arxivId,
  };
}

async function searchPage(query: string, page: number): Promise<{ count: number; results: RawWork[] }> {
  await throttle();
  const params = new URLSearchParams({
    search: query,
    page: String(page),
    "per-page": String(PAGE_SIZE),
    select: SELECT,
  });
  const headers: Record<string, string> = {};
  // The `mailto` is what buys the 10 req/s polite pool — it is not authentication.
  const mailto = env.openAlexMailto;
  if (mailto) {
    params.set("mailto", mailto);
    headers["User-Agent"] = `research-to-deck (mailto:${mailto})`;
  }

  const res = await fetchWithRetry(`${API_BASE}/works?${params}`, { headers }, { retries: 5, baseDelayMs: 1_000 });
  if (!res.ok) throw new HttpError(`OpenAlex search failed: ${res.status} ${await res.text()}`, res.status);
  const body = (await res.json()) as { meta?: { count?: number }; results?: RawWork[] };
  return { count: body.meta?.count ?? 0, results: body.results ?? [] };
}

/** Fetches enough search pages to select `count` papers (over-fetches 2x to allow filtering). */
export async function searchPapers(query: string, count: number): Promise<Paper[]> {
  const target = Math.min(count * 2, 300);
  const collected: Paper[] = [];
  for (let fetched = 0, page = 1; fetched < target; fetched += PAGE_SIZE, page++) {
    const { count: total, results } = await searchPage(query, page);
    collected.push(...results.map(normalizeWork).filter((p): p is Paper => p !== null));
    if (results.length < PAGE_SIZE || fetched + PAGE_SIZE >= total) break;
  }
  return selectPapers(collected, count);
}
