import { DECK_RULES, type DeckDraft, type RenderDeck, type SourcePaper } from "./deckSchema";

export interface DeckValidation {
  deck: DeckDraft;
  issues: string[];
}

/**
 * Enforces the citation contract: every citation key must belong to a retrieved paper,
 * and every bullet must keep at least one valid citation. Invalid keys are removed,
 * uncited bullets are dropped, and slide/bullet counts are checked.
 * `issues` lists everything that had to be fixed so the caller can request a repair.
 */
export function validateDeck(draft: DeckDraft, allowedKeys: Set<string>): DeckValidation {
  const issues: string[] = [];
  const slides = draft.slides.map((slide, s) => {
    const bullets = slide.bullets
      .map((b, i) => {
        const valid = [...new Set(b.citations.map((c) => c.trim().toUpperCase()))].filter((c) => allowedKeys.has(c));
        const invalid = b.citations.filter((c) => !allowedKeys.has(c.trim().toUpperCase()));
        if (invalid.length) issues.push(`Slide ${s + 1} bullet ${i + 1} cites unknown source(s): ${invalid.join(", ")}`);
        if (!valid.length) issues.push(`Slide ${s + 1} bullet ${i + 1} has no valid citation and was removed`);
        return { text: b.text.trim(), citations: valid };
      })
      .filter((b) => b.citations.length > 0 && b.text.length > 0);

    if (bullets.length < DECK_RULES.minBullets) {
      issues.push(`Slide ${s + 1} "${slide.title}" has ${bullets.length} cited bullets (need ${DECK_RULES.minBullets}-${DECK_RULES.maxBullets})`);
    }
    if (bullets.length > DECK_RULES.maxBullets) {
      issues.push(`Slide ${s + 1} "${slide.title}" has ${bullets.length} bullets (max ${DECK_RULES.maxBullets}); extras were trimmed`);
    }
    if (!slide.speaker_notes.trim()) issues.push(`Slide ${s + 1} "${slide.title}" is missing speaker notes`);
    return { ...slide, bullets: bullets.slice(0, DECK_RULES.maxBullets) };
  });

  // Slides left with fewer than 2 cited bullets aren't worth keeping.
  const kept = slides.filter((s) => s.bullets.length >= 2).slice(0, DECK_RULES.maxSlides);
  if (kept.length < DECK_RULES.minSlides || kept.length > DECK_RULES.maxSlides || draft.slides.length > DECK_RULES.maxSlides) {
    issues.push(`Deck has ${draft.slides.length} content slides (${kept.length} usable); need ${DECK_RULES.minSlides}-${DECK_RULES.maxSlides}`);
  }
  return { deck: { ...draft, slides: kept }, issues };
}

export function formatReference(p: SourcePaper): string {
  const authors =
    p.authors.length === 0 ? "Unknown authors" : p.authors.length > 3 ? `${p.authors.slice(0, 3).join(", ")}, et al.` : p.authors.join(", ");
  const parts = [`${authors} (${p.year ?? "n.d."}).`, `${p.title}.`];
  if (p.venue) parts.push(`${p.venue}.`);
  const link = p.doi ? `https://doi.org/${p.doi}` : p.url;
  if (link) parts.push(link);
  return parts.join(" ");
}

/**
 * Converts P-keys into sequential reference numbers in order of first appearance,
 * and builds the references list containing only papers actually cited.
 */
export function toRenderDeck(
  deck: DeckDraft,
  sources: SourcePaper[],
  meta: { topic: string; generatedOn: string; statsLine: string },
): RenderDeck {
  const byKey = new Map(sources.map((s) => [s.key, s]));
  const numbers = new Map<string, number>();
  const numberFor = (key: string) => {
    if (!numbers.has(key)) numbers.set(key, numbers.size + 1);
    return numbers.get(key)!;
  };

  const slides = deck.slides.map((slide) => {
    const bullets = slide.bullets.map((b) => ({
      text: b.text,
      refs: b.citations.filter((k) => byKey.has(k)).map(numberFor),
    }));
    const cited = [...new Set(bullets.flatMap((b) => b.refs))].sort((a, b) => a - b);
    const sourceLine = cited.length ? `\n\nSources on this slide: ${cited.map((n) => `[${n}]`).join(" ")}` : "";
    return { title: slide.title, bullets, notes: slide.speaker_notes.trim() + sourceLine };
  });

  const references = [...numbers.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([key, n]) => ({ n, text: formatReference(byKey.get(key)!) }));

  return {
    title: deck.deck_title,
    subtitle: deck.subtitle,
    topic: meta.topic,
    generated_on: meta.generatedOn,
    stats_line: meta.statsLine,
    slides,
    references,
  };
}
