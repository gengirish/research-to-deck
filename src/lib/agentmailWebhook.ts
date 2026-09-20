import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Verification and parsing for AgentMail's inbound webhooks.
 *
 * AgentMail delivers through Svix, so payloads carry svix-id / svix-timestamp /
 * svix-signature. Verifying the scheme directly keeps the dependency list short;
 * it is a plain HMAC over `id.timestamp.body`.
 */

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export interface SvixHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export function readSvixHeaders(headers: Headers): SvixHeaders {
  return {
    id: headers.get("svix-id") ?? headers.get("webhook-id"),
    timestamp: headers.get("svix-timestamp") ?? headers.get("webhook-timestamp"),
    signature: headers.get("svix-signature") ?? headers.get("webhook-signature"),
  };
}

/**
 * Verifies a Svix signature over the *raw* request body. Passing a re-serialized
 * body will fail: whitespace and key order are part of what was signed.
 */
export function verifyWebhookSignature(
  rawBody: string,
  headers: SvixHeaders,
  secret: string,
  now: Date = new Date(),
): { ok: true } | { ok: false; reason: string } {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return { ok: false, reason: "Missing svix headers" };

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) return { ok: false, reason: "Invalid svix-timestamp" };
  const skew = Math.abs(Math.floor(now.getTime() / 1000) - sentAt);
  if (skew > SIGNATURE_TOLERANCE_SECONDS) return { ok: false, reason: "Timestamp outside tolerance" };

  // Secrets are distributed as whsec_<base64>; the raw key is the decoded part.
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest();

  // The header holds a space-delimited list so secrets can be rotated.
  const candidates = signature
    .split(" ")
    .filter((part) => part.startsWith("v1,"))
    .map((part) => Buffer.from(part.slice(3), "base64"));
  if (candidates.length === 0) return { ok: false, reason: "No v1 signature present" };

  const matched = candidates.some((candidate) => candidate.length === expected.length && timingSafeEqual(candidate, expected));
  return matched ? { ok: true } : { ok: false, reason: "Signature mismatch" };
}

/**
 * Webhook bodies arrive in the API's snake_case wire format, not the SDK's
 * camelCase shape, so they are parsed here rather than through the SDK types.
 */
const MessageReceivedSchema = z.object({
  type: z.literal("event"),
  event_type: z.string(),
  event_id: z.string(),
  message: z.object({
    inbox_id: z.string(),
    thread_id: z.string(),
    message_id: z.string(),
    from: z.string(),
    to: z.array(z.string()).optional(),
    subject: z.string().optional(),
    text: z.string().optional(),
    extracted_text: z.string().optional(),
  }),
});

export type InboundMessage = z.infer<typeof MessageReceivedSchema>["message"];

export type ParsedEvent =
  | { kind: "message"; eventId: string; message: InboundMessage }
  | { kind: "ignored"; reason: string }
  | { kind: "invalid"; reason: string };

export function parseWebhookEvent(payload: unknown): ParsedEvent {
  const parsed = MessageReceivedSchema.safeParse(payload);
  if (!parsed.success) {
    // Other event types (message.sent, message.bounced, ...) share the envelope
    // but not the message shape. Acknowledge rather than error on them.
    const eventType = (payload as { event_type?: unknown })?.event_type;
    if (typeof eventType === "string") return { kind: "ignored", reason: `Unhandled event ${eventType}` };
    return { kind: "invalid", reason: "Unrecognized webhook payload" };
  }

  const { event_type: eventType, event_id: eventId, message } = parsed.data;
  // Spam, blocked, and unauthenticated deliveries reuse this payload shape.
  if (eventType !== "message.received") return { kind: "ignored", reason: `Unhandled event ${eventType}` };
  return { kind: "message", eventId, message };
}

/** Pulls the bare address out of `Display Name <user@example.com>`. */
export function parseAddress(from: string): string | null {
  const angled = from.match(/<([^>]+)>/);
  const address = (angled ? angled[1] : from).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ? address : null;
}

const SUBJECT_NOISE = /^(?:\s*(?:re|fwd?|fw|aw|sv)\s*:\s*)+/i;
const PAPER_COUNT = /^\s*papers?\s*[:=]\s*(\d{1,3})\s*$/im;

export interface DeckRequest {
  topic: string;
  paperCount: number;
}

/**
 * Derives a deck request from an inbound email: the subject is the topic, with
 * the first substantial body line as a fallback, and an optional `papers: N`
 * line overriding the default corpus size.
 */
export function parseDeckRequest(message: InboundMessage): { ok: true; request: DeckRequest } | { ok: false; reason: string } {
  const body = message.extracted_text ?? message.text ?? "";

  let topic = (message.subject ?? "").replace(SUBJECT_NOISE, "").trim();
  if (topic.length < 3) {
    topic =
      body
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length >= 3 && !PAPER_COUNT.test(line) && !line.startsWith(">")) ?? "";
  }
  if (topic.length < 3) return { ok: false, reason: "no topic in the subject line or body" };
  topic = topic.slice(0, 300);

  const match = body.match(PAPER_COUNT);
  const requested = match ? Number(match[1]) : 50;
  // Clamp rather than reject: a sender who asks for 500 papers still wants a deck.
  const paperCount = Math.min(100, Math.max(10, requested));

  return { ok: true, request: { topic, paperCount } };
}
