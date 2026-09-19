import { validateDeck } from "./citations";
import { claudeJson } from "./claude";
import { getPool } from "./db";
import { DECK_RULES, DeckDraftSchema, type DeckDraft, type SourcePaper } from "./deckSchema";
import type { RetrievedChunk } from "./retrieval";

const SYSTEM_PROMPT = `You are a research analyst who turns academic literature into an executive-ready slide deck.

You receive excerpts from papers inside <sources>. Each paper has a key such as P3.

Rules:
- Every bullet MUST cite at least one source key from <sources> in its "citations" array (e.g. ["P3","P7"]). Use only keys that appear in <sources>.
- Every claim in a bullet must be supported by the excerpts of the papers it cites. Do not use outside knowledge for factual claims.
- When sources disagree, say so and cite both sides.
- Write ${DECK_RULES.minSlides}-${DECK_RULES.maxSlides} content slides with ${DECK_RULES.minBullets}-${DECK_RULES.maxBullets} bullets each. Do not include a title slide or references slide; those are added automatically.
- Bullets are specific findings (numbers, methods, comparisons), at most 25 words each, with no citation markers in the text itself.
- A good arc: landscape/overview, core approaches, key results, evaluation methods, comparisons/trade-offs, limitations and open problems, practical implications, and where the field is heading.
- speaker_notes: 3-5 sentences a presenter can say aloud, expanding on the bullets with context.`;

export async function loadSourcePapers(chunks: RetrievedChunk[]): Promise<SourcePaper[]> {
  const ids = [...new Set(chunks.map((c) => c.paperId))];
  const { rows } = await getPool().query<{
    paper_id: string; title: string; authors: string[]; year: number | null; venue: string | null; url: string | null; doi: string | null;
  }>(`SELECT paper_id, title, authors, year, venue, url, doi FROM papers WHERE paper_id = ANY($1)`, [ids]);
  const byId = new Map(rows.map((r) => [r.paper_id, r]));
  return ids.map((id, i) => {
    const r = byId.get(id)!;
    return { key: `P${i + 1}`, paperId: id, title: r.title, authors: r.authors, year: r.year, venue: r.venue, url: r.url, doi: r.doi };
  });
}

export function buildSourcesBlock(chunks: RetrievedChunk[], sources: SourcePaper[]): string {
  const grouped = sources.map((s) => {
    const excerpts = chunks
      .filter((c) => c.paperId === s.paperId)
      .map((c) => `<excerpt${c.page ? ` page="${c.page}"` : ""}>\n${c.content}\n</excerpt>`)
      .join("\n");
    const authors = s.authors.slice(0, 3).join(", ") + (s.authors.length > 3 ? " et al." : "");
    return `<paper key="${s.key}" title="${s.title.replace(/"/g, "'")}" authors="${authors}" year="${s.year ?? "n.d."}">\n${excerpts}\n</paper>`;
  });
  return `<sources>\n${grouped.join("\n")}\n</sources>`;
}

/**
 * Asks Claude for the deck, validates every citation against the retrieved set, and
 * requests one repair pass if the draft breaks the rules. Returns the cleaned deck.
 */
export async function synthesizeDeck(
  topic: string,
  chunks: RetrievedChunk[],
  sources: SourcePaper[],
): Promise<{ deck: DeckDraft; issuesFixed: number; repaired: boolean }> {
  const allowed = new Set(sources.map((s) => s.key));
  const sourcesBlock = buildSourcesBlock(chunks, sources);
  const request = `${sourcesBlock}\n\nResearch topic: ${topic}\n\nCreate the deck.`;

  const first = await claudeJson({ system: SYSTEM_PROMPT, user: request, schema: DeckDraftSchema, effort: "medium" });
  const firstCheck = validateDeck(first, allowed);
  if (firstCheck.issues.length === 0) return { deck: firstCheck.deck, issuesFixed: 0, repaired: false };

  const repairRequest =
    `${request}\n\nYour previous draft was:\n<draft>\n${JSON.stringify(first)}\n</draft>\n\n` +
    `It broke these rules:\n${firstCheck.issues.map((i) => `- ${i}`).join("\n")}\n\n` +
    `Return a corrected full deck that fixes every issue. Valid citation keys: ${[...allowed].join(", ")}.`;
  const second = await claudeJson({ system: SYSTEM_PROMPT, user: repairRequest, schema: DeckDraftSchema, effort: "medium" });
  const secondCheck = validateDeck(second, allowed);

  // Keep whichever version needed fewer fixes; validateDeck has already stripped anything invalid.
  const best = secondCheck.issues.length <= firstCheck.issues.length ? secondCheck : firstCheck;
  if (best.deck.slides.length < 5) {
    throw new Error(`Synthesis produced only ${best.deck.slides.length} well-cited slides: ${best.issues.slice(0, 3).join("; ")}`);
  }
  return { deck: best.deck, issuesFixed: best.issues.length, repaired: true };
}
