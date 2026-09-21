import { stripControlChars } from "./chunk";

/**
 * Provider-agnostic paper shape. Every search provider (OpenAlex, Semantic Scholar)
 * normalises into this, so ingest/chunking/synthesis never care where a paper came from.
 */
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

/** Strips control characters from provider text before it reaches Postgres (TEXT and the JSONB search cache). */
export function sanitizePaper(p: Paper): Paper {
  const clean = (s: string | null) => (s === null ? null : stripControlChars(s));
  return {
    ...p,
    title: stripControlChars(p.title),
    authors: p.authors.map(stripControlChars),
    venue: clean(p.venue),
    abstract: clean(p.abstract),
  };
}

/**
 * Keeps the provider's relevance order, but promotes papers that have usable
 * content (PDF or abstract) ahead of title-only ones, then takes `count`.
 */
export function selectPapers(papers: Paper[], count: number): Paper[] {
  const seen = new Set<string>();
  const unique = papers.filter((p) => !seen.has(p.paperId) && seen.add(p.paperId));
  const withContent = unique.filter((p) => p.pdfUrl || p.abstract);
  const titleOnly = unique.filter((p) => !p.pdfUrl && !p.abstract);
  return [...withContent, ...titleOnly].slice(0, count);
}
