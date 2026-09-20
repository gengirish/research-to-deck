import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  type InboundMessage,
  parseAddress,
  parseDeckRequest,
  parseWebhookEvent,
  readSvixHeaders,
  verifyWebhookSignature,
} from "../src/lib/agentmailWebhook";

const SECRET = `whsec_${randomBytes(24).toString("base64")}`;

function sign(body: string, id = "msg_123", timestamp = String(Math.floor(Date.now() / 1000))) {
  const key = Buffer.from(SECRET.replace(/^whsec_/, ""), "base64");
  const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return { id, timestamp, signature: `v1,${signature}` };
}

const message = (extra: Partial<InboundMessage> = {}): InboundMessage => ({
  inbox_id: "decks@agentmail.to",
  thread_id: "thread_1",
  message_id: "msg_1",
  from: "Ada Lovelace <ada@example.org>",
  subject: "sparse attention for long context",
  text: "Thanks!",
  ...extra,
});

const event = (extra: Partial<InboundMessage> = {}, eventType = "message.received") => ({
  type: "event",
  event_type: eventType,
  event_id: "evt_1",
  message: message(extra),
});

describe("verifyWebhookSignature", () => {
  const body = JSON.stringify(event());

  it("accepts a correctly signed payload", () => {
    expect(verifyWebhookSignature(body, sign(body), SECRET)).toEqual({ ok: true });
  });

  it("accepts when one of several rotated signatures matches", () => {
    const valid = sign(body);
    const headers = { ...valid, signature: `v1,${randomBytes(32).toString("base64")} ${valid.signature}` };
    expect(verifyWebhookSignature(body, headers, SECRET).ok).toBe(true);
  });

  it("rejects a tampered body", () => {
    const headers = sign(body);
    const result = verifyWebhookSignature(body.replace("sparse", "dense"), headers, SECRET);
    expect(result).toEqual({ ok: false, reason: "Signature mismatch" });
  });

  it("rejects a signature made with a different secret", () => {
    const key = Buffer.from("whsec_AAAA".replace(/^whsec_/, ""), "base64");
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", key).update(`msg_123.${timestamp}.${body}`).digest("base64");
    const result = verifyWebhookSignature(body, { id: "msg_123", timestamp, signature: `v1,${signature}` }, SECRET);
    expect(result.ok).toBe(false);
  });

  it("rejects a replayed timestamp outside tolerance", () => {
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    const result = verifyWebhookSignature(body, sign(body, "msg_123", old), SECRET);
    expect(result).toEqual({ ok: false, reason: "Timestamp outside tolerance" });
  });

  it("rejects missing headers", () => {
    const result = verifyWebhookSignature(body, { id: null, timestamp: null, signature: null }, SECRET);
    expect(result).toEqual({ ok: false, reason: "Missing svix headers" });
  });

  it("rejects a header with no v1 entry", () => {
    const { id, timestamp } = sign(body);
    const result = verifyWebhookSignature(body, { id, timestamp, signature: "v0,abc" }, SECRET);
    expect(result).toEqual({ ok: false, reason: "No v1 signature present" });
  });

  it("reads both svix- and webhook- header spellings", () => {
    expect(readSvixHeaders(new Headers({ "svix-id": "a", "svix-timestamp": "1", "svix-signature": "v1,b" }))).toEqual({
      id: "a",
      timestamp: "1",
      signature: "v1,b",
    });
    expect(readSvixHeaders(new Headers({ "webhook-id": "a" })).id).toBe("a");
  });
});

describe("parseWebhookEvent", () => {
  it("returns the message for message.received", () => {
    const result = parseWebhookEvent(event());
    expect(result.kind).toBe("message");
    if (result.kind === "message") {
      expect(result.eventId).toBe("evt_1");
      expect(result.message.message_id).toBe("msg_1");
    }
  });

  it("ignores spam and other received variants", () => {
    expect(parseWebhookEvent(event({}, "message.received.spam")).kind).toBe("ignored");
    expect(parseWebhookEvent(event({}, "message.bounced")).kind).toBe("ignored");
  });

  it("ignores unknown event types with a foreign payload shape", () => {
    expect(parseWebhookEvent({ event_type: "message.sent", whatever: true }).kind).toBe("ignored");
  });

  it("flags payloads that are not events at all", () => {
    expect(parseWebhookEvent({ hello: "world" }).kind).toBe("invalid");
  });
});

describe("parseAddress", () => {
  it("extracts and lowercases the address", () => {
    expect(parseAddress("Ada Lovelace <Ada@Example.org>")).toBe("ada@example.org");
    expect(parseAddress("  ada@example.org ")).toBe("ada@example.org");
  });

  it("returns null for unparseable senders", () => {
    expect(parseAddress("Ada Lovelace")).toBeNull();
    expect(parseAddress("<not an address>")).toBeNull();
  });
});

describe("parseDeckRequest", () => {
  it("uses the subject as the topic with the default corpus size", () => {
    const result = parseDeckRequest(message());
    expect(result).toEqual({ ok: true, request: { topic: "sparse attention for long context", paperCount: 50 } });
  });

  it("strips reply and forward prefixes", () => {
    const result = parseDeckRequest(message({ subject: "Re: Fwd: RE: graph neural networks" }));
    expect(result.ok && result.request.topic).toBe("graph neural networks");
  });

  it("honours a papers: line in the body", () => {
    const result = parseDeckRequest(message({ text: "papers: 25\nthanks" }));
    expect(result.ok && result.request.paperCount).toBe(25);
  });

  it("clamps an out-of-range corpus size instead of refusing", () => {
    const tooMany = parseDeckRequest(message({ text: "papers: 500" }));
    const tooFew = parseDeckRequest(message({ text: "papers: 1" }));
    expect(tooMany.ok && tooMany.request.paperCount).toBe(100);
    expect(tooFew.ok && tooFew.request.paperCount).toBe(10);
  });

  it("falls back to the first substantial body line when the subject is empty", () => {
    const result = parseDeckRequest(message({ subject: "", text: "\n> quoted\npapers: 30\nprotein folding models\n" }));
    expect(result.ok && result.request.topic).toBe("protein folding models");
    expect(result.ok && result.request.paperCount).toBe(30);
  });

  it("prefers extracted_text over the full quoted body", () => {
    const result = parseDeckRequest(message({ subject: "Re:", text: "old thread", extracted_text: "vector database benchmarks" }));
    expect(result.ok && result.request.topic).toBe("vector database benchmarks");
  });

  it("rejects an email with no usable topic", () => {
    const result = parseDeckRequest(message({ subject: "Re:", text: "" }));
    expect(result).toEqual({ ok: false, reason: "no topic in the subject line or body" });
  });

  it("truncates an overlong topic to the column limit", () => {
    const result = parseDeckRequest(message({ subject: "x".repeat(500) }));
    expect(result.ok && result.request.topic.length).toBe(300);
  });
});
