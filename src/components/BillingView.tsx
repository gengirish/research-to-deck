"use client";

import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useState } from "react";
import ThemeSwitch from "./ThemeSwitch";

interface Pack {
  id: string;
  label: string;
  credits: number;
  amountCents: number;
}

interface BillingState {
  enabled: boolean;
  balance: number | null;
  paid: boolean;
  canBrand: boolean;
  packs: Pack[];
  freeCredits: number;
}

interface BrandState {
  brand: { name: string; footer: string; primary: string; accent: string; dark: string } | null;
  hasLogo: boolean;
}

/** The IntelliForge defaults from python/brand.json, as a starting point for the form. */
const DEFAULT_BRAND = { name: "", footer: "", primary: "#7C3AED", accent: "#06B6D4", dark: "#0A0F1C" };

const usd = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

/** Dodo payment statuses that mean no money moved and no credits are coming. */
const FAILED_STATUSES = new Set(["failed", "cancelled"]);

/**
 * `checkout` is the return flag on the checkout's return / cancel URL; `paymentStatus` is
 * the `status` Dodo appends to it.
 */
export default function BillingView({ checkout, paymentStatus }: { checkout?: string; paymentStatus?: string }) {
  const paymentFailed = checkout === "success" && paymentStatus !== undefined && FAILED_STATUSES.has(paymentStatus);
  const { isLoaded, isSignedIn } = useAuth();
  const [billing, setBilling] = useState<BillingState | null>(null);
  const [brand, setBrand] = useState<BrandState | null>(null);
  const [form, setForm] = useState(DEFAULT_BRAND);
  const [logoVersion, setLogoVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    Promise.all([fetch("/api/billing", { cache: "no-store" }), fetch("/api/brand", { cache: "no-store" })])
      .then(async ([b, br]) => {
        const billingData = b.ok ? ((await b.json()) as BillingState) : null;
        const brandData = br.ok ? ((await br.json()) as BrandState) : null;
        if (cancelled) return;
        if (billingData) setBilling(billingData);
        if (brandData) {
          setBrand(brandData);
          if (brandData.brand) {
            const { name, footer, primary, accent, dark } = brandData.brand;
            setForm({ name, footer, primary: `#${primary}`, accent: `#${accent}`, dark: `#${dark}` });
          }
        }
        if (!billingData) setError("Could not load your credits. Refresh to try again.");
      })
      .catch(() => !cancelled && setError("Could not load your credits. Refresh to try again."));
    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  // Credits are granted by the webhook, which can land after this page loads, so after a
  // checkout re-read the balance for a short while until it moves.
  const initialBalance = billing?.balance ?? null;
  useEffect(() => {
    if (checkout !== "success" || paymentFailed || !isSignedIn || initialBalance === null) return;
    let cancelled = false;
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      try {
        const res = await fetch("/api/billing", { cache: "no-store" });
        if (res.ok && !cancelled) {
          const next = (await res.json()) as BillingState;
          if (next.balance !== initialBalance) {
            setBilling(next);
            clearInterval(timer);
          }
        }
      } catch {
        // Transient; the next tick retries.
      }
      if (tries >= 15) clearInterval(timer);
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [checkout, paymentFailed, isSignedIn, initialBalance]);

  async function buy(packId: string) {
    setBusy(packId);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error ?? "Could not start checkout");
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout");
      setBusy(null);
    }
  }

  async function saveBrand(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy("brand");
    setError(null);
    setSaved(null);
    try {
      const res = await fetch("/api/brand", { method: "PUT", body: new FormData(e.currentTarget) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not save the brand");
      setBrand(data);
      setLogoVersion((v) => v + 1);
      setSaved("Saved. Your next deck renders with this brand.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the brand");
    } finally {
      setBusy(null);
    }
  }

  async function removeBrand() {
    setBusy("brand");
    setError(null);
    setSaved(null);
    const res = await fetch("/api/brand", { method: "DELETE" });
    if (res.ok) {
      setBrand({ brand: null, hasLogo: false });
      setForm(DEFAULT_BRAND);
      setSaved("Brand removed. Decks go back to the default IntelliForge style.");
    }
    setBusy(null);
  }

  const set = (key: keyof typeof DEFAULT_BRAND) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="nav site-nav">
        <div className="nav-brand brand-lock">
          <span className="mark">IntelliForge</span>
          <span className="sub">Research / Deck</span>
        </div>
        <Link href="/">Back to the brief</Link>
        <ThemeSwitch />
        <div className="nav-auth">{isLoaded && isSignedIn && <UserButton />}</div>
      </header>
      <div className="rule" />

      <main className="wrap wrap-narrow" id="main">
        <h1 className="auth-title">Credits &amp; brand</h1>

        {checkout === "success" && !paymentFailed && (
          <p className="notice" role="status">
            Back from checkout. If the payment went through, your credits appear here within a few seconds.
          </p>
        )}
        {paymentFailed && (
          <p className="notice" role="alert">
            The payment didn&rsquo;t go through, so nothing was charged. Try again with another card or, in India, UPI.
          </p>
        )}
        {checkout === "cancelled" && (
          <p className="notice" role="status">
            Checkout cancelled. Nothing was charged.
          </p>
        )}

        {isLoaded && !isSignedIn ? (
          <>
            <p className="auth-blurb">Sign in to see your credits and set up your deck brand.</p>
            <SignInButton mode="modal">
              <button type="button" className="btn btn-primary">
                Sign in
              </button>
            </SignInButton>
          </>
        ) : !billing ? (
          <p className="text-muted">Loading…</p>
        ) : (
          <>
            <section aria-labelledby="credits-h" style={{ marginBottom: 44 }}>
              <div className="panel-head">
                <h2 id="credits-h" className="panel-label">
                  Credits
                </h2>
                {billing.enabled && <span className="meta">One credit = one deck</span>}
              </div>
              {billing.enabled ? (
                <>
                  <p className="auth-blurb">
                    You have <strong>{billing.balance}</strong> {billing.balance === 1 ? "credit" : "credits"}. A run that
                    fails gives its credit back.
                  </p>
                  <table className="table">
                    <thead>
                      <tr>
                        <th scope="col">Pack</th>
                        <th scope="col">Price</th>
                        <th scope="col">Per deck</th>
                        <th scope="col">
                          <span className="vh">Buy</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {billing.packs.map((p) => (
                        <tr key={p.id}>
                          <td>{p.label}</td>
                          <td>{usd(p.amountCents)}</td>
                          <td>{usd(Math.round(p.amountCents / p.credits))}</td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => buy(p.id)}
                              disabled={busy !== null}
                            >
                              {busy === p.id ? "Opening…" : "Buy"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="field-help">Payments by Dodo Payments. Prices are in USD; checkout may charge in your local currency and adds sales tax or VAT for your country. Any purchase also unlocks custom deck branding below.</p>
                </>
              ) : (
                <p className="auth-blurb">Billing is off on this deployment, so runs are unlimited.</p>
              )}
            </section>

            <section aria-labelledby="brand-h">
              <div className="panel-head">
                <h2 id="brand-h" className="panel-label">
                  Deck brand
                </h2>
                {!billing.canBrand && <span className="tag tag-neutral">Unlocks with a purchase</span>}
              </div>
              <p className="auth-blurb">
                Your name, footer, colors and logo on every slide, so a deck can go to a client as it is.
              </p>
              <form onSubmit={saveBrand}>
                <fieldset disabled={!billing.canBrand || busy !== null} style={{ border: 0, padding: 0, margin: 0 }}>
                  <div className="field-grid">
                    <div className="field">
                      <label htmlFor="brand-name">Brand name</label>
                      <input id="brand-name" name="name" className="input" value={form.name} onChange={set("name")} maxLength={60} required />
                    </div>
                    <div className="field">
                      <label htmlFor="brand-footer">Footer</label>
                      <input
                        id="brand-footer"
                        name="footer"
                        className="input"
                        value={form.footer}
                        onChange={set("footer")}
                        maxLength={80}
                        placeholder="acme.com · Confidential"
                      />
                    </div>
                  </div>
                  <div className="field-grid" style={{ marginTop: 18 }}>
                    {(
                      [
                        ["primary", "Primary"],
                        ["accent", "Accent"],
                        ["dark", "Title background"],
                      ] as const
                    ).map(([key, label]) => (
                      <div className="field" key={key}>
                        <label htmlFor={`brand-${key}`}>{label}</label>
                        <input id={`brand-${key}`} name={key} type="color" className="input" value={form[key]} onChange={set(key)} />
                      </div>
                    ))}
                  </div>
                  <div className="field" style={{ marginTop: 18 }}>
                    <label htmlFor="brand-logo">Logo</label>
                    <input id="brand-logo" name="logo" type="file" accept="image/png,image/jpeg" aria-describedby="logo-help" />
                    <p className="field-help" id="logo-help">
                      PNG or JPEG, under 512 KB. A wide logo on a transparent background works best.
                    </p>
                    {brand?.hasLogo && (
                      <div className="submit-row" style={{ marginTop: 10 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- private, per-user image */}
                        <img src={`/api/brand/logo?v=${logoVersion}`} alt="Current logo" style={{ height: 36, width: "auto" }} />
                        <label className="field-help">
                          <input type="checkbox" name="removeLogo" value="1" /> Remove logo
                        </label>
                      </div>
                    )}
                  </div>
                  <div className="submit-row">
                    <button type="submit" className="btn btn-primary">
                      {busy === "brand" ? "Saving…" : "Save brand"}
                    </button>
                    {brand?.brand && (
                      <button type="button" className="btn btn-secondary" onClick={removeBrand}>
                        Use the default brand
                      </button>
                    )}
                  </div>
                </fieldset>
              </form>
            </section>
          </>
        )}

        {saved && (
          <p className="notice" role="status" style={{ marginTop: 18 }}>
            {saved}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
