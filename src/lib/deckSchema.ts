import { z } from "zod";

// Shape Claude must return. Count limits (8–12 slides, 3–5 bullets) are enforced in
// validateDeck rather than the schema so a near-miss can be repaired, not rejected.
export const DeckDraftSchema = z.object({
  deck_title: z.string(),
  subtitle: z.string(),
  slides: z.array(
    z.object({
      title: z.string(),
      bullets: z.array(
        z.object({
          text: z.string(),
          citations: z.array(z.string()),
        }),
      ),
      speaker_notes: z.string(),
    }),
  ),
});
export type DeckDraft = z.infer<typeof DeckDraftSchema>;

export const SubQueriesSchema = z.object({
  queries: z.array(z.string()),
});

export const DECK_RULES = {
  minSlides: 8,
  maxSlides: 12,
  minBullets: 3,
  maxBullets: 5,
} as const;

export interface SourcePaper {
  key: string; // "P1", "P2", ... — the only citation keys Claude may use
  paperId: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  url: string | null;
  doi: string | null;
}

/** Final, render-ready deck consumed by python/render_deck.py. */
export interface RenderDeck {
  title: string;
  subtitle: string;
  topic: string;
  generated_on: string;
  stats_line: string;
  slides: { title: string; bullets: { text: string; refs: number[] }[]; notes: string }[];
  references: { n: number; text: string }[];
}
