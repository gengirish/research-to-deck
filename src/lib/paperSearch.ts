import { env } from "./env";
import * as openAlex from "./openAlex";
import * as semanticScholar from "./semanticScholar";
import { sanitizePaper, type Paper } from "./paper";

export type { Paper };

export type PaperSource = "openalex" | "semanticscholar";

const PROVIDERS = {
  openalex: { label: "OpenAlex", search: openAlex.searchPapers },
  semanticscholar: { label: "Semantic Scholar", search: semanticScholar.searchPapers },
} as const satisfies Record<PaperSource, { label: string; search: (q: string, n: number) => Promise<Paper[]> }>;

export function paperSource(): PaperSource {
  return env.paperSource;
}

/** Human-readable provider name for deck footers, emails, and error messages. */
export function paperSourceLabel(): string {
  return PROVIDERS[paperSource()].label;
}

/**
 * Searches the configured provider. OpenAlex is the default because it needs no API key:
 * a `mailto` puts us in the polite pool (10 req/s), whereas unauthenticated Semantic
 * Scholar answers 429 to effectively every request.
 */
export async function searchPapers(query: string, count: number): Promise<Paper[]> {
  const papers = await PROVIDERS[paperSource()].search(query, count);
  return papers.map(sanitizePaper);
}
