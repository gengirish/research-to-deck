import { describe, expect, it } from "vitest";
import { deckAcceptedEmail, deckFailedEmail, deckReadyEmail, deckRejectedEmail, escapeHtml } from "../src/lib/emailTemplates";

const ready = (attached: boolean) =>
  deckReadyEmail({
    topic: "sparse attention",
    downloadUrl: "https://example.com/api/decks/abc/download",
    slides: 12,
    references: 30,
    papers: 50,
    attached,
  });

describe("escapeHtml", () => {
  it("neutralizes markup from user-supplied topics", () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(escapeHtml("Tom & Jerry's")).toBe("Tom &amp; Jerry&#39;s");
  });
});

describe("deckReadyEmail", () => {
  it("puts the topic in the subject and both bodies", () => {
    const body = ready(true);
    expect(body.subject).toBe("Deck ready: sparse attention");
    expect(body.text).toContain("sparse attention");
    expect(body.html).toContain("sparse attention");
  });

  it("says the deck is attached when it fit", () => {
    expect(ready(true).text).toContain("attached to this email");
    expect(ready(true).text).not.toContain("too large");
  });

  it("points at the download link when the deck was too large to attach", () => {
    const body = ready(false);
    expect(body.text).toContain("too large to attach");
    expect(body.text).toContain("https://example.com/api/decks/abc/download");
  });

  it("escapes a topic containing markup", () => {
    const body = deckReadyEmail({ ...ready(true), topic: "<b>bold</b>", downloadUrl: "https://e.com/d", attached: true, slides: 1, references: 1, papers: 1 });
    expect(body.html).not.toContain("<b>bold</b>");
    expect(body.html).toContain("&lt;b&gt;bold&lt;/b&gt;");
  });
});

describe("deckFailedEmail", () => {
  it("reports the reason and status link", () => {
    const body = deckFailedEmail({ topic: "t", error: "Semantic Scholar returned no papers", statusUrl: "https://e.com/s" });
    expect(body.subject).toBe("Deck failed: t");
    expect(body.text).toContain("Semantic Scholar returned no papers");
    expect(body.html).toContain("https://e.com/s");
  });

  it("truncates a runaway error message", () => {
    const body = deckFailedEmail({ topic: "t", error: "e".repeat(5000), statusUrl: "https://e.com/s" });
    expect(body.text).toContain("e".repeat(500));
    expect(body.text).not.toContain("e".repeat(501));
  });
});

describe("deckAcceptedEmail and deckRejectedEmail", () => {
  it("acknowledges with the topic and paper count", () => {
    const body = deckAcceptedEmail({ topic: "graph nets", paperCount: 40, statusUrl: "https://e.com/s" });
    expect(body.subject).toBe("Working on: graph nets");
    expect(body.text).toContain("up to 40 papers");
  });

  it("tells a rejected sender how to retry", () => {
    const body = deckRejectedEmail("no topic in the subject line or body");
    expect(body.text).toContain("no topic in the subject line or body");
    expect(body.text).toContain("Subject:");
  });
});
