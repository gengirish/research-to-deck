import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { canUseCustomBrand, CREDIT_PACKS, findPack } from "../src/lib/billing";
import { checkoutParams, purchaseFromSession } from "../src/lib/stripe";

const session = (over: Partial<Stripe.Checkout.Session>) =>
  ({
    id: "cs_test_1",
    payment_status: "paid",
    amount_total: 4900,
    metadata: { user_id: "user_abc", pack_id: "starter", credits: "5" },
    ...over,
  }) as Stripe.Checkout.Session;

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

describe("checkoutParams", () => {
  it("builds a one-off inline-priced session that carries what the webhook needs", () => {
    const params = checkoutParams(findPack("starter")!, "user_abc", "https://app.example.com");
    expect(params.mode).toBe("payment");
    expect(params.line_items?.[0].price_data?.unit_amount).toBe(4900);
    expect(params.metadata).toEqual({ user_id: "user_abc", pack_id: "starter", credits: "5" });
    expect(params.success_url).toBe("https://app.example.com/billing?checkout=success");
    expect(params.cancel_url).toBe("https://app.example.com/billing?checkout=cancelled");
  });
});

describe("purchaseFromSession", () => {
  it("turns a paid session into a grant", () => {
    expect(purchaseFromSession(session({}))).toEqual({ sessionId: "cs_test_1", userId: "user_abc", credits: 5, amountCents: 4900 });
  });

  // An async payment method completes the session before the money arrives; the
  // grant waits for `async_payment_succeeded`, which carries payment_status "paid".
  it("grants nothing until the session is paid", () => {
    expect(purchaseFromSession(session({ payment_status: "unpaid" }))).toBeNull();
  });

  it("ignores sessions that are not credit purchases", () => {
    expect(purchaseFromSession(session({ metadata: {} }))).toBeNull();
    expect(purchaseFromSession(session({ metadata: { user_id: "user_abc", credits: "0" } }))).toBeNull();
    expect(purchaseFromSession(session({ metadata: { user_id: "user_abc", credits: "lots" } }))).toBeNull();
  });

  it("reads a session out of a signed webhook payload", () => {
    const stripe = new Stripe("sk_test_dummy");
    const secret = "whsec_test_secret";
    const payload = JSON.stringify({
      id: "evt_1",
      object: "event",
      type: "checkout.session.completed",
      data: { object: session({}) },
    });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
    const event = stripe.webhooks.constructEvent(payload, header, secret);
    expect(event.type).toBe("checkout.session.completed");
    expect(purchaseFromSession(event.data.object as Stripe.Checkout.Session)?.credits).toBe(5);
    expect(() => stripe.webhooks.constructEvent(payload, header, "whsec_wrong")).toThrow();
  });
});
