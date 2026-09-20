/** Shapes the status endpoint returns, and the small derivations the views share. */

export interface JobEvent {
  id: number;
  stage: string;
  level: "info" | "success" | "warn" | "error";
  message: string;
  detail: Record<string, unknown> | null;
  at: string;
}

/** Mirrors RenderDeck in src/lib/deckSchema.ts — the deck the worker built. */
export interface RenderDeck {
  title: string;
  subtitle: string;
  topic: string;
  generated_on: string;
  stats_line: string;
  slides: { title: string; bullets: { text: string; refs: number[] }[]; notes: string }[];
  references: { n: number; text: string }[];
}

export interface JobStats {
  papers_found?: number;
  ingest?: { papers: number; pdf: number; abstract: number; titleOnly: number; reused: number; chunks: number };
  sub_queries?: string[];
  retrieved_chunks?: number;
  retrieved_papers?: number;
  slides?: number;
  references?: number;
  citation_issues_fixed?: number;
  timings?: Record<string, number>;
}

export interface JobStatus {
  jobId: string;
  topic: string;
  status: "queued" | "running" | "done" | "failed";
  stage: string;
  progress: number;
  error: string | null;
  downloadUrl: string | null;
  events: JobEvent[];
  deck: RenderDeck | null;
  createdAt: string;
  stats: JobStats;
}

/** The pipeline, in the order the worker runs it. Drives the phase list. */
export const PHASES = [
  { key: "queued", label: "Queued" },
  { key: "searching", label: "OpenAlex screening" },
  { key: "ingesting", label: "Full-text reading" },
  { key: "retrieving", label: "Evidence retrieval" },
  { key: "synthesizing", label: "Slide composition" },
  { key: "rendering", label: "Deck rendering" },
  { key: "done", label: "Deck ready" },
] as const;

export const phaseIndex = (stage: string) => {
  const i = PHASES.findIndex((p) => p.key === stage);
  return i === -1 ? 0 : i;
};

export const pad2 = (n: number) => String(n).padStart(2, "0");

export const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${pad2(total % 60)}`;
}

/** Reference numbers cited anywhere on a slide, in order. */
export function slideRefs(slide: RenderDeck["slides"][number]): number[] {
  return [...new Set(slide.bullets.flatMap((b) => b.refs))].sort((a, b) => a - b);
}

/**
 * Splits a formatted reference into its citation text and its trailing link, so
 * the DOI can be rendered as an anchor the way the design shows it.
 */
export function splitReference(text: string): { citation: string; href: string | null } {
  const match = text.match(/\s(https?:\/\/\S+)$/);
  if (!match) return { citation: text, href: null };
  return { citation: text.slice(0, match.index).trim(), href: match[1] };
}

/** Strips the "[12/50] " counter the ingest events carry, leaving the paper title. */
export function stripCounter(message: string): string {
  return message.replace(/^\[\d+\/\d+]\s*/, "");
}
