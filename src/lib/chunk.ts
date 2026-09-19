export interface Chunk {
  index: number;
  page: number | null;
  content: string;
}

// ~4 chars per token: ~800-token chunks with ~100-token overlap.
export const CHUNK_CHARS = 3_200;
export const OVERLAP_CHARS = 400;
export const MAX_CHUNKS_PER_PAPER = 30;

export function cleanText(text: string): string {
  return text
    .replace(/-\n(?=[a-z])/g, "") // re-join hyphenated line breaks
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Drops the bibliography: everything after a "References"/"Bibliography" heading
 * that appears in the second half of the document.
 */
export function stripReferences(pages: string[]): string[] {
  const total = pages.length;
  for (let i = Math.floor(total / 2); i < total; i++) {
    const match = /\b(References|REFERENCES|Bibliography|BIBLIOGRAPHY)\b/.exec(pages[i]);
    if (match) {
      return [...pages.slice(0, i), pages[i].slice(0, match.index)].filter((p) => p.trim().length > 0);
    }
  }
  return pages;
}

/** Finds a sentence boundary to cut at, preferring the end of the window. */
function cutPoint(text: string, min: number, max: number): number {
  if (text.length <= max) return text.length;
  const window = text.slice(min, max);
  const lastSentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "));
  if (lastSentence >= 0) return min + lastSentence + 1;
  const lastSpace = window.lastIndexOf(" ");
  return lastSpace >= 0 ? min + lastSpace : max;
}

/** Splits per-page PDF text into overlapping chunks that remember their starting page. */
export function chunkPages(pages: string[], startIndex = 0): Chunk[] {
  const segments = stripReferences(pages)
    .map((text, i) => ({ page: i + 1, text: cleanText(text) }))
    .filter((s) => s.text.length > 0);

  // Flatten with page offsets so each chunk can report where it starts.
  let full = "";
  const offsets: { start: number; page: number }[] = [];
  for (const s of segments) {
    offsets.push({ start: full.length, page: s.page });
    full += (full ? " " : "") + s.text;
  }
  const pageAt = (pos: number) => {
    let page = offsets[0]?.page ?? null;
    for (const o of offsets) if (o.start <= pos) page = o.page;
    return page;
  };

  const chunks: Chunk[] = [];
  let pos = 0;
  while (pos < full.length && chunks.length < MAX_CHUNKS_PER_PAPER) {
    const rest = full.slice(pos);
    const end = cutPoint(rest, Math.floor(CHUNK_CHARS * 0.75), CHUNK_CHARS);
    const content = rest.slice(0, end).trim();
    if (content.length >= 200 || chunks.length === 0) {
      chunks.push({ index: startIndex + chunks.length, page: pageAt(pos), content });
    }
    if (pos + end >= full.length) break;
    pos += Math.max(end - OVERLAP_CHARS, 1);
  }
  return chunks;
}

/** The always-present summary chunk: guarantees every paper is retrievable even without a PDF. */
export function summaryChunk(paper: { title: string; abstract: string | null; year: number | null; venue: string | null }): Chunk {
  const meta = [paper.venue, paper.year].filter(Boolean).join(", ");
  const content = [`Title: ${paper.title}${meta ? ` (${meta})` : ""}`, paper.abstract ? `Abstract: ${cleanText(paper.abstract)}` : ""]
    .filter(Boolean)
    .join("\n");
  return { index: 0, page: null, content };
}
