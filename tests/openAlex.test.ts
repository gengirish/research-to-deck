import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeWork, reconstructAbstract, searchPapers, type RawWork } from "../src/lib/openAlex";

const work = (i: number, extra: Partial<RawWork> = {}): RawWork => ({
  id: `https://openalex.org/W${i}`,
  doi: `https://doi.org/10.1/${i}`,
  display_name: `Paper ${i}`,
  publication_year: 2024,
  authorships: [{ author: { display_name: "Ada" } }],
  primary_location: { landing_page_url: `https://ex.com/${i}`, source: { display_name: "NeurIPS" } },
  best_oa_location: { pdf_url: `https://arxiv.org/pdf/${i}` },
  cited_by_count: 7,
  abstract_inverted_index: { Abstract: [0], [`${i}`]: [1] },
  ...extra,
});

afterEach(() => vi.unstubAllGlobals());

describe("reconstructAbstract", () => {
  it("rebuilds word order from the inverted index", () => {
    expect(reconstructAbstract({ retrieval: [0, 3], augmented: [1], generation: [2], works: [4] })).toBe(
      "retrieval augmented generation retrieval works",
    );
  });

  it("returns null for a missing or empty index", () => {
    expect(reconstructAbstract(null)).toBeNull();
    expect(reconstructAbstract({})).toBeNull();
  });
});

describe("normalizeWork", () => {
  it("maps fields, shortens the id, and strips the doi prefix", () => {
    const p = normalizeWork(work(1))!;
    expect(p).toMatchObject({
      paperId: "W1",
      title: "Paper 1",
      authors: ["Ada"],
      year: 2024,
      venue: "NeurIPS",
      abstract: "Abstract 1",
      citationCount: 7,
      doi: "10.1/1",
      arxivId: "1",
      pdfUrl: "https://arxiv.org/pdf/1",
      url: "https://doi.org/10.1/1",
    });
  });

  it("derives a PDF url from an arXiv landing page when no pdf_url is given", () => {
    const p = normalizeWork(
      work(2, {
        best_oa_location: { landing_page_url: "https://arxiv.org/abs/2401.00002v3" },
        primary_location: null,
        open_access: null,
      }),
    )!;
    expect(p).toMatchObject({ arxivId: "2401.00002", pdfUrl: "https://arxiv.org/pdf/2401.00002" });
  });

  it("falls back to the open-access location for the venue name", () => {
    const p = normalizeWork(
      work(6, { primary_location: { source: null }, best_oa_location: { source: { display_name: "arXiv" } } }),
    )!;
    expect(p.venue).toBe("arXiv");
  });

  it("treats a work with no open-access location as abstract-only", () => {
    const p = normalizeWork(work(3, { best_oa_location: null, primary_location: { source: null }, open_access: null }))!;
    expect(p.pdfUrl).toBeNull();
    expect(p.venue).toBeNull();
    expect(p.abstract).toBe("Abstract 3");
  });

  it("rejects works without an id or title", () => {
    expect(normalizeWork(work(4, { display_name: " " }))).toBeNull();
    expect(normalizeWork(work(5, { id: null }))).toBeNull();
  });
});

describe("searchPapers", () => {
  it("retries on 429 and returns selected papers", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("slow down", { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(Response.json({ meta: { count: 3 }, results: [work(1), work(2), work(3)] }));
    vi.stubGlobal("fetch", fetchMock);

    const papers = await searchPapers("rag evaluation", 2);
    expect(papers.map((p) => p.paperId)).toEqual(["W1", "W2"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const url = new URL(fetchMock.mock.calls[1][0] as string);
    expect(url.searchParams.get("search")).toBe("rag evaluation");
    expect(url.searchParams.get("per-page")).toBe("100");
    expect(url.searchParams.get("select")).toContain("abstract_inverted_index");
  }, 20_000);

  it("ranks papers with content ahead of title-only ones", async () => {
    const bare = work(9, { best_oa_location: null, primary_location: null, open_access: null, abstract_inverted_index: null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ meta: { count: 2 }, results: [bare, work(8)] })));

    const papers = await searchPapers("topic", 2);
    expect(papers.map((p) => p.paperId)).toEqual(["W8", "W9"]);
  }, 20_000);
});
