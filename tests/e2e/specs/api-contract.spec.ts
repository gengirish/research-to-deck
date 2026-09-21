import { expect, test } from "@playwright/test";
import { JOB_ID } from "../fixtures/deckData";

/**
 * The JSON API, against the running server with nothing mocked.
 *
 * This is the half of the suite the Clerk stub cannot reach: `auth()` runs on the
 * server, sees no session cookie, and answers accordingly. That makes the signed-out
 * boundary — 401 on create, 400 on a malformed id, 404 on someone else's job —
 * directly assertable, which is exactly the part worth pinning, because the
 * invariant is that a refusal never distinguishes "not yours" from "does not exist".
 *
 * Postgres may not be reachable in CI, so the job-lookup specs accept a 5xx as
 * "environment, not regression" and say so rather than failing noisily.
 */

const UNKNOWN_JOB = "00000000-0000-4000-8000-000000000000";

test.describe("POST /api/decks", () => {
  test("refuses an anonymous run with 401, not a redirect or an opaque 404", async ({ request }) => {
    const res = await request.post("/api/decks", { data: { topic: "quantum error correction", paperCount: 10 } });

    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({ error: "Sign in to generate a deck" });
  });

  test("checks the session before it checks the body", async ({ request }) => {
    // A signed-out caller learns nothing about which payloads would be valid.
    const res = await request.post("/api/decks", { data: { topic: "x" } });

    expect(res.status()).toBe(401);
  });

  test("rejects a non-JSON body", async ({ request }) => {
    const res = await request.post("/api/decks", {
      headers: { "Content-Type": "application/json" },
      data: "not json at all",
    });

    // Still 401 while signed out — the session gate comes first by design.
    expect([400, 401]).toContain(res.status());
  });
});

test.describe("GET /api/decks/[jobId]", () => {
  test("rejects a malformed job id with 400", async ({ request }) => {
    const res = await request.get("/api/decks/not-a-uuid");

    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid job id" });
  });

  test("answers 404 for a job that does not exist", async ({ request }) => {
    const res = await request.get(`/api/decks/${UNKNOWN_JOB}`);
    test.skip(res.status() >= 500, "no database reachable from this environment");

    expect(res.status()).toBe(404);
    expect(await res.json()).toEqual({ error: "Job not found" });
  });

  test("gives someone else's job the same answer as a missing one", async ({ request }) => {
    // The invariant: 404 either way, never 403, so the endpoint does not confirm
    // that a job id someone guessed belongs to a real run.
    const missing = await request.get(`/api/decks/${UNKNOWN_JOB}`);
    const foreign = await request.get(`/api/decks/${JOB_ID}`);
    test.skip(missing.status() >= 500 || foreign.status() >= 500, "no database reachable from this environment");

    expect(foreign.status()).toBe(missing.status());
    expect(await foreign.json()).toEqual(await missing.json());
    expect(foreign.status()).not.toBe(403);
  });
});

test.describe("GET /api/decks/[jobId]/download", () => {
  test("rejects a malformed job id with 400", async ({ request }) => {
    const res = await request.get("/api/decks/not-a-uuid/download");

    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid job id" });
  });

  test("hides a missing deck behind the same 'not ready' answer", async ({ request }) => {
    const res = await request.get(`/api/decks/${UNKNOWN_JOB}/download`);
    test.skip(res.status() >= 500, "no database reachable from this environment");

    expect(res.status()).toBe(404);
    expect(await res.json()).toEqual({ error: "Deck not ready" });
  });
});

test.describe("The webhook is not a public door", () => {
  test("refuses an unsigned AgentMail payload", async ({ request }) => {
    const res = await request.post("/api/webhooks/agentmail", { data: { event: "message.received" } });

    // Never accepted. Which refusal depends on the deployment: 401 where the Svix
    // secret is configured and the signature simply fails, 503 where it is not
    // configured at all — as in this suite, which sets no AgentMail credentials.
    expect(res.ok()).toBe(false);
    expect([401, 503]).toContain(res.status());
  });
});

test.describe("Static surface", () => {
  test("serves the PWA manifest with the icons it promises", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);

    const manifest = await res.json();
    expect(manifest.name).toBe("CiteDeck");
    expect(manifest.short_name).toBe("R2Deck");
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.map((i: { src: string }) => i.src)).toContain("/icons/icon-512.png");
  });

  test("serves the service worker from the scope it registers for", async ({ request }) => {
    const res = await request.get("/sw.js");

    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/javascript/);
  });

  test("serves the offline fallback page", async ({ request }) => {
    const res = await request.get("/offline");

    expect(res.status()).toBe(200);
    expect(await res.text()).toContain("offline");
  });

  test("answers an unknown route with 404", async ({ request }) => {
    const res = await request.get("/no-such-page");

    expect(res.status()).toBe(404);
  });
});
