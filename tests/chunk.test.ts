import { describe, expect, it } from "vitest";
import { CHUNK_CHARS, MAX_CHUNKS_PER_PAPER, chunkPages, stripReferences, summaryChunk } from "../src/lib/chunk";

const sentence = (i: number) => `This is sentence number ${i} about retrieval augmented generation. `;
const page = (from: number, n: number) => Array.from({ length: n }, (_, i) => sentence(from + i)).join("");

describe("chunkPages", () => {
  it("splits long text into bounded, overlapping chunks that end on sentence boundaries", () => {
    const chunks = chunkPages([page(0, 60), page(60, 60), page(120, 60)], 1);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks[0].index).toBe(1);
    for (const c of chunks) expect(c.content.length).toBeLessThanOrEqual(CHUNK_CHARS);
    for (const c of chunks.slice(0, -1)) expect(c.content.endsWith(".")).toBe(true);
    // overlap: the start of chunk 2 appears inside chunk 1
    expect(chunks[0].content).toContain(chunks[1].content.slice(0, 40));
  });

  it("records the page each chunk starts on", () => {
    const chunks = chunkPages([page(0, 60), page(60, 60), page(120, 60)]);
    expect(chunks[0].page).toBe(1);
    expect(chunks.at(-1)!.page).toBe(3);
  });

  it("caps chunks per paper", () => {
    const pages = Array.from({ length: 40 }, (_, i) => page(i * 100, 100));
    expect(chunkPages(pages)).toHaveLength(MAX_CHUNKS_PER_PAPER);
  });
});

describe("stripReferences", () => {
  it("drops the bibliography from the second half of the document", () => {
    const pages = ["Intro text.", "Method text.", "Results text.", "Conclusion. References [1] Smith 2020."];
    const out = stripReferences(pages);
    expect(out.join(" ")).not.toContain("Smith 2020");
    expect(out.join(" ")).toContain("Conclusion.");
  });

  it("ignores 'references' mentioned early in the paper", () => {
    const pages = ["We use References to prior work.", "Body.", "More body.", "End."];
    expect(stripReferences(pages)).toEqual(pages);
  });
});

describe("summaryChunk", () => {
  it("includes title, venue/year, and abstract", () => {
    const c = summaryChunk({ title: "RAG Eval", abstract: "We  study\nRAG.", year: 2024, venue: "ACL" });
    expect(c.index).toBe(0);
    expect(c.content).toBe("Title: RAG Eval (ACL, 2024)\nAbstract: We study RAG.");
  });

  it("works for title-only papers", () => {
    expect(summaryChunk({ title: "X", abstract: null, year: null, venue: null }).content).toBe("Title: X");
  });
});
