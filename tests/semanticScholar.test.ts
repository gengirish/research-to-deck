import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizePaper, searchPapers, selectPapers, type Paper } from "../src/lib/semanticScholar";

const raw = (i: number, extra: Record<string, unknown> = {}) => ({
  paperId: `p${i}`,
  title: `Paper ${i}`,
  authors: [{ name: "Ada" }],
  year: 2024,
  abstract: `Abstract ${i}`,
  externalIds: { DOI: `10.1/${i}`, ArXiv: `2401.0000${i}` },
  openAccessPdf: { url: `https://arxiv.org/pdf/${i}` },
  ...extra,
});

afterEach(() => vi.unstubAllGlobals());

describe("normalizePaper", () => {
  it("maps fields and treats empty PDF urls as missing", () => {
    const p = normalizePaper(raw(1, { openAccessPdf: { url: "" }, venue: "" }))!;
    expect(p).toMatchObject({ paperId: "p1", pdfUrl: null, venue: null, doi: "10.1/1", arxivId: "2401.00001", authors: ["Ada"] });
  });

  it("rejects papers without a title", () => {
    expect(normalizePaper(raw(1, { title: " " }))).toBeNull();
  });
});

describe("selectPapers", () => {
  it("dedupes and ranks papers with content ahead of title-only ones", () => {
    const papers = [
      normalizePaper(raw(1, { abstract: null, openAccessPdf: null }))!,
      normalizePaper(raw(2))!,
      normalizePaper(raw(2))!,
      normalizePaper(raw(3, { openAccessPdf: null }))!,
    ] as Paper[];
    expect(selectPapers(papers, 3).map((p) => p.paperId)).toEqual(["p2", "p3", "p1"]);
  });
});

describe("searchPapers", () => {
  it("retries on 429 and returns selected papers", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(Response.json({ total: 3, data: [raw(1), raw(2), raw(3)] }));
    vi.stubGlobal("fetch", fetchMock);

    const papers = await searchPapers("rag evaluation", 2);
    expect(papers.map((p) => p.paperId)).toEqual(["p1", "p2"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const url = new URL(fetchMock.mock.calls[1][0] as string);
    expect(url.searchParams.get("query")).toBe("rag evaluation");
    expect(url.searchParams.get("fields")).toContain("openAccessPdf");
  }, 20_000);
});
