import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "../src/lib/agentmailWebhook";
import { canUseCustomBrand, CREDIT_PACKS, findPack } from "../src/lib/billing";
import { checkoutBody, PACK_PRODUCT_ENV, productIdFor, purchaseFromEvent } from "../src/lib/dodo";

const paymentEvent = (data: Record<string, unknown> = {}, type = "payment.succeeded") => ({
  business_id: "bus_1",
  type,
  timestamp: "2026-09-21T10:00:00Z",
  data: {
    payload_type: "Payment",
    payment_id: "pay_1",
    total_amount: 5341,
    currency: "USD",
    metadata: { user_id: "user_abc", pack_id: "starter", credits: "5" },
    ...data,
  },
});

describe("credit packs", () => {
  it("finds a pack by id and rejects anything else", () => {
    expect(findPack("starter")?.credits).toBe(5);
    expect(findPack("nope")).toBeUndefined();
    expect(findPack(undefined)).toBeUndefined();
  });

  it("prices bigger packs cheaper per deck", () => {
    const perDeck = CREDIT_PACKS.map((p) => p.amountCents / p.credits);
    expect([...perDeck].sort((a, b) => b - a)).toEqual(perDeck);
  });

  it("maps every pack to a Dodo product env var", () => {
    for (const pack of CREDIT_PACKS) expect(PACK_PRODUCT_ENV[pack.id]).toBeTruthy();
  });

  it("names the missing product variable instead of failing vaguely", () => {
    delete process.env.DODO_PRODUCT_PRO;
    expect(() => productIdFor(findPack("pro")!)).toThrow("DODO_PRODUCT_PRO");
  });
});

describe("canUseCustomBrand", () => {
  it("needs a completed purchase when billing is on", () => {
    expect(canUseCustomBrand({ balance: 1, paid: false }, true)).toBe(false);
    expect(canUseCustomBrand({ balance: 0, paid: true }, true)).toBe(true);
    expect(canUseCustomBrand(null, true)).toBe(false);
  });

  it("is open to everyone when billing is off", () => {
    expect(canUseCustomBrand(null, false)).toBe(true);
  });
});

describe("checkoutBody", () => {
  it("buys one of the pack's product and carries what the webhook needs", () => {
    const body = checkoutBody(findPack("starter")!, "pdt_starter", "user_abc", "https://app.example.com");
    expect(body.product_cart).toEqual([{ product_id: "pdt_starter", quantity: 1 }]);
    expect(body.metadata).toEqual({ user_id: "user_abc", pack_id: "starter", credits: "5" });
    expect(body.return_url).toBe("https://app.example.com/billing?checkout=success");
    expect(body.cancel_url).toBe("https://app.example.com/billing?checkout=cancelled");
  });
});

describe("purchaseFromEvent", () => {
  it("turns a succeeded payment into a grant keyed on the payment id", () => {
    expect(purchaseFromEvent(paymentEvent())).toEqual({ paymentRef: "pay_1", userId: "user_abc", credits: 5, amountCents: 5341 });
  });

  it("grants nothing for other event types", () => {
    expect(purchaseFromEvent(paymentEvent({}, "payment.failed"))).toBeNull();
    expect(purchaseFromEvent(paymentEvent({}, "payment.processing"))).toBeNull();
  });

  it("ignores payments that are not credit purchases", () => {
    expect(purchaseFromEvent(paymentEvent({ metadata: {} }))).toBeNull();
    expect(purchaseFromEvent(paymentEvent({ metadata: null }))).toBeNull();
    expect(purchaseFromEvent(paymentEvent({ metadata: { user_id: "user_abc", credits: "0" } }))).toBeNull();
    expect(purchaseFromEvent(paymentEvent({ metadata: { user_id: "user_abc", credits: "lots" } }))).toBeNull();
    expect(purchaseFromEvent({ nonsense: true })).toBeNull();
  });
});

// Dodo signs with Standard Webhooks: base64 HMAC-SHA256 over `id.timestamp.body`, keyed
// with the base64 part of a whsec_ secret, sent as `v1,<sig>` in webhook-signature.
describe("Dodo webhook signature", () => {
  const secret = `whsec_${Buffer.from("dodo-test-key").toString("base64")}`;
  const body = JSON.stringify(paymentEvent());
  const now = new Date("2026-09-21T10:00:00Z");
  const ts = String(Math.floor(now.getTime() / 1000));
  const sign = (key: string) =>
    `v1,${createHmac("sha256", Buffer.from(key.replace(/^whsec_/, ""), "base64")).update(`msg_1.${ts}.${body}`).digest("base64")}`;
  const headers = (signature: string) => ({ id: "msg_1", timestamp: ts, signature });

  it("accepts a correctly signed payment event", () => {
    expect(verifyWebhookSignature(body, headers(sign(secret)), secret, now)).toEqual({ ok: true });
  });

  it("rejects a wrong key and a tampered body", () => {
    const wrong = `whsec_${Buffer.from("other").toString("base64")}`;
    expect(verifyWebhookSignature(body, headers(sign(wrong)), secret, now).ok).toBe(false);
    expect(verifyWebhookSignature(body.replace('"5"', '"500"'), headers(sign(secret)), secret, now).ok).toBe(false);
  });
});
