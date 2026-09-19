import { describe, expect, it } from "vitest";
import { formatReference, toRenderDeck, validateDeck } from "../src/lib/citations";
import type { DeckDraft, SourcePaper } from "../src/lib/deckSchema";
import { diversify } from "../src/lib/retrieval";

const source = (n: number, extra: Partial<SourcePaper> = {}): SourcePaper => ({
  key: `P${n}`,
  paperId: `id${n}`,
  title: `Paper ${n}`,
  authors: ["Ada Lovelace", "Alan Turing"],
  year: 2024,
  venue: "NeurIPS",
  url: `https://example.org/${n}`,
  doi: null,
  ...extra,
});

const slide = (title: string, cites: string[][]) => ({
  title,
  speaker_notes: "Notes.",
  bullets: cites.map((c, i) => ({ text: `Finding ${i + 1}`, citations: c })),
});

const goodDeck = (): DeckDraft => ({
  deck_title: "T",
  subtitle: "S",
  slides: Array.from({ length: 8 }, (_, i) => slide(`Slide ${i + 1}`, [["P1"], ["P2"], ["P1", "P3"]])),
});

const allowed = new Set(["P1", "P2", "P3"]);

describe("validateDeck", () => {
  it("accepts a deck that follows every rule", () => {
    const { deck, issues } = validateDeck(goodDeck(), allowed);
    expect(issues).toEqual([]);
    expect(deck.slides).toHaveLength(8);
  });

  it("strips citations to papers outside the retrieved set and drops uncited bullets", () => {
    const draft = goodDeck();
    draft.slides[0] = slide("Hallucinated", [["P1", "P99"], ["P42"], ["P2"], ["p3"]]);
    const { deck, issues } = validateDeck(draft, allowed);
    const first = deck.slides[0];
    expect(first.bullets.map((b) => b.citations)).toEqual([["P1"], ["P2"], ["P3"]]);
    expect(issues.some((i) => i.includes("P99"))).toBe(true);
    expect(issues.some((i) => i.includes("no valid citation"))).toBe(true);
  });

  it("drops slides left with fewer than two cited bullets and flags the slide count", () => {
    const draft = goodDeck();
    draft.slides[3] = slide("Weak", [["P9"], ["P1"]]);
    const { deck, issues } = validateDeck(draft, allowed);
    expect(deck.slides).toHaveLength(7);
    expect(issues.some((i) => i.includes("need 8-12"))).toBe(true);
  });

  it("trims bullets beyond the maximum", () => {
    const draft = goodDeck();
    draft.slides[0] = slide("Long", Array.from({ length: 7 }, () => ["P1"]));
    const { deck, issues } = validateDeck(draft, allowed);
    expect(deck.slides[0].bullets).toHaveLength(5);
    expect(issues.some((i) => i.includes("trimmed"))).toBe(true);
  });
});

describe("toRenderDeck", () => {
  it("numbers references by first appearance and lists only cited papers", () => {
    const sources = [source(1), source(2), source(3), source(4)];
    const draft: DeckDraft = {
      deck_title: "T",
      subtitle: "S",
      slides: [slide("A", [["P3"], ["P1", "P3"]]), slide("B", [["P2"]])],
    };
    const out = toRenderDeck(draft, sources, { topic: "t", generatedOn: "2026-09-19", statsLine: "x" });
    expect(out.slides[0].bullets.map((b) => b.refs)).toEqual([[1], [2, 1]]);
    expect(out.slides[1].bullets[0].refs).toEqual([3]);
    expect(out.references.map((r) => r.n)).toEqual([1, 2, 3]);
    expect(out.references[0].text).toContain("Paper 3");
    expect(out.references.some((r) => r.text.includes("Paper 4"))).toBe(false);
    expect(out.slides[0].notes).toContain("Sources on this slide: [1] [2]");
  });
});

describe("formatReference", () => {
  it("abbreviates long author lists and prefers DOI links", () => {
    const ref = formatReference(source(1, { authors: ["A", "B", "C", "D"], doi: "10.1/xyz" }));
    expect(ref).toBe("A, B, C, et al. (2024). Paper 1. NeurIPS. https://doi.org/10.1/xyz");
  });
});

describe("diversify", () => {
  it("caps chunks per paper while preserving rank order", () => {
    const items = ["a", "a", "a", "a", "b", "c", "b"].map((paperId, i) => ({ paperId, i }));
    expect(diversify(items, 2, 10).map((x) => x.i)).toEqual([0, 1, 4, 5, 6]);
    expect(diversify(items, 2, 3).map((x) => x.i)).toEqual([0, 1, 4]);
  });
});
