import { paperSourceLabel } from "./paperSearch";

/**
 * Pure render helpers for the emails AgentMail sends. Kept free of I/O so the
 * wording and escaping can be unit tested without touching the API.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface EmailBody {
  subject: string;
  text: string;
  html: string;
}

function shell(heading: string, inner: string): string {
  return `<!doctype html>
<html>
  <body style="font-family: -apple-system, Segoe UI, Helvetica, Arial, sans-serif; color: #1f2937; line-height: 1.55; max-width: 600px; margin: 0 auto;">
    <h2 style="color: #1d4ed8; margin: 0 0 16px;">${heading}</h2>
${inner}
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 28px 0 12px;">
    <p style="color: #9ca3af; font-size: 12px; margin: 0;">
      research-to-deck &middot; slides synthesized from ${paperSourceLabel()} papers with per-bullet citations.
    </p>
  </body>
</html>`;
}

function button(url: string, label: string): string {
  return `    <p style="margin: 24px 0;">
      <a href="${escapeHtml(url)}" style="background-color: #1d4ed8; color: #ffffff; padding: 11px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">${escapeHtml(label)}</a>
    </p>`;
}

export interface DeckReadyInput {
  topic: string;
  downloadUrl: string;
  slides: number;
  references: number;
  papers: number;
  /** False when the deck was too large to attach and only the link is offered. */
  attached: boolean;
}

export function deckReadyEmail(input: DeckReadyInput): EmailBody {
  const { topic, downloadUrl, slides, references, papers, attached } = input;
  const facts = `${slides} slides, ${references} references, synthesized from ${papers} papers`;
  const attachmentLine = attached
    ? "The .pptx is attached to this email."
    : "The deck was too large to attach, so use the download link below.";

  const text = [
    `Your deck on "${topic}" is ready.`,
    "",
    facts + ".",
    attachmentLine,
    "",
    `Download: ${downloadUrl}`,
    "",
    "Every bullet carries a citation key that maps to the references slide.",
  ].join("\n");

  const html = shell(
    "Your deck is ready",
    `    <p>Your deck on <strong>${escapeHtml(topic)}</strong> is ready.</p>
    <p style="background-color: #f3f4f6; padding: 12px 16px; border-radius: 6px; margin: 16px 0;">${escapeHtml(facts)}.<br>${escapeHtml(attachmentLine)}</p>
${button(downloadUrl, "Download deck")}
    <p style="color: #6b7280; font-size: 14px;">Every bullet carries a citation key that maps to the references slide.</p>`,
  );

  return { subject: `Deck ready: ${topic}`, text, html };
}

export interface DeckFailedInput {
  topic: string;
  /** Raw pipeline error; shown verbatim but truncated. */
  error: string;
  statusUrl: string;
}

export function deckFailedEmail(input: DeckFailedInput): EmailBody {
  const { topic, statusUrl } = input;
  const error = input.error.slice(0, 500);

  const text = [
    `We could not build your deck on "${topic}".`,
    "",
    `Reason: ${error}`,
    "",
    `Job status: ${statusUrl}`,
    "",
    "Replying to this email with a narrower topic is usually enough to get a run through.",
  ].join("\n");

  const html = shell(
    "Deck generation failed",
    `    <p>We could not build your deck on <strong>${escapeHtml(topic)}</strong>.</p>
    <p style="background-color: #fef2f2; border-left: 3px solid #dc2626; padding: 12px 16px; margin: 16px 0;"><code>${escapeHtml(error)}</code></p>
    <p style="font-size: 14px;">Job status: <a href="${escapeHtml(statusUrl)}">${escapeHtml(statusUrl)}</a></p>
    <p style="color: #6b7280; font-size: 14px;">Replying to this email with a narrower topic is usually enough to get a run through.</p>`,
  );

  return { subject: `Deck failed: ${topic}`, text, html };
}

export interface DeckAcceptedInput {
  topic: string;
  paperCount: number;
  statusUrl: string;
}

/** Immediate acknowledgement for a deck requested over email, since a run takes minutes. */
export function deckAcceptedEmail(input: DeckAcceptedInput): EmailBody {
  const { topic, paperCount, statusUrl } = input;

  const text = [
    `Working on your deck: "${topic}".`,
    "",
    `We are searching ${paperSourceLabel()} for up to ${paperCount} papers, ingesting them, and synthesizing cited slides.`,
    "This usually takes several minutes. The finished .pptx comes back as a reply to this thread.",
    "",
    `Live status: ${statusUrl}`,
  ].join("\n");

  const html = shell(
    "Working on your deck",
    `    <p>Working on your deck: <strong>${escapeHtml(topic)}</strong>.</p>
    <p>We are searching ${paperSourceLabel()} for up to ${paperCount} papers, ingesting them, and synthesizing cited slides. This usually takes several minutes &mdash; the finished .pptx comes back as a reply to this thread.</p>
    <p style="font-size: 14px;">Live status: <a href="${escapeHtml(statusUrl)}">${escapeHtml(statusUrl)}</a></p>`,
  );

  return { subject: `Working on: ${topic}`, text, html };
}

/** Sent when an inbound email carries no usable topic. */
export function deckRejectedEmail(reason: string): EmailBody {
  const text = [
    `We could not start a deck from that email: ${reason}`,
    "",
    "Send the topic as the subject line, for example:",
    "  Subject: retrieval-augmented generation for clinical decision support",
    "",
    "Add a line like `papers: 40` in the body to change how many papers are searched (10-100).",
  ].join("\n");

  const html = shell(
    "We need a topic",
    `    <p>We could not start a deck from that email: ${escapeHtml(reason)}</p>
    <p>Send the topic as the subject line, for example:</p>
    <p style="background-color: #f3f4f6; padding: 12px 16px; border-radius: 6px; font-family: monospace;">Subject: retrieval-augmented generation for clinical decision support</p>
    <p style="color: #6b7280; font-size: 14px;">Add a line like <code>papers: 40</code> in the body to change how many papers are searched (10&ndash;100).</p>`,
  );

  return { subject: "We need a topic to build a deck", text, html };
}
