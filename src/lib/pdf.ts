import { extractText, getDocumentProxy } from "unpdf";
import { fetchWithRetry } from "./http";

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_PAGES = 30;

/**
 * Downloads an open-access PDF and returns its text per page.
 * Returns null (never throws) when the PDF is unavailable, too large, or not a PDF,
 * so the caller can fall back to the abstract.
 */
export async function fetchPdfPages(url: string): Promise<string[] | null> {
  try {
    const res = await fetchWithRetry(
      url,
      { headers: { "User-Agent": "research-to-deck/0.1 (academic research tool)", Accept: "application/pdf" }, redirect: "follow" },
      { retries: 1, timeoutMs: 25_000 },
    );
    if (!res.ok) return null;
    const declared = Number(res.headers.get("content-length"));
    if (declared > MAX_PDF_BYTES) return null;

    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > MAX_PDF_BYTES) return null;
    // "%PDF" magic bytes: many "open access" links resolve to HTML landing pages.
    if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) return null;

    const doc = await getDocumentProxy(bytes);
    const { text } = await extractText(doc, { mergePages: false });
    const pages = (Array.isArray(text) ? text : [text]).slice(0, MAX_PAGES);
    const totalChars = pages.reduce((n, p) => n + p.length, 0);
    return totalChars > 500 ? pages : null; // scanned PDFs with no text layer
  } catch {
    return null;
  }
}
