// End-to-end check against a running deployment.
// Usage: npm run smoke -- <baseUrl> "<topic>" [paperCount]
//
// Creating a deck needs a Clerk session, and so does reading the job back, so put a
// signed-in session cookie in SMOKE_COOKIE — copy the `__session=…` cookie for the
// target origin out of your browser's devtools. Without it the POST answers 401.
import { writeFile } from "node:fs/promises";

const [baseUrl = "http://localhost:3000", topic = "retrieval-augmented generation evaluation", count = "50"] = process.argv.slice(2);
const started = Date.now();
const auth: Record<string, string> = process.env.SMOKE_COOKIE ? { Cookie: process.env.SMOKE_COOKIE } : {};

const create = await fetch(`${baseUrl}/api/decks`, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...auth },
  body: JSON.stringify({ topic, paperCount: Number(count) }),
});
const created = (await create.json()) as { jobId?: string; error?: string };
console.log(`POST /api/decks -> ${create.status}`, created);
if (create.status === 401) {
  console.error("Set SMOKE_COOKIE to a signed-in session cookie for this origin (see the header comment).");
}
if (!created.jobId) process.exit(1);

let lastStage = "";
for (;;) {
  await new Promise((r) => setTimeout(r, 3000));
  const res = await fetch(`${baseUrl}/api/decks/${created.jobId}`, { headers: auth });
  const job = (await res.json()) as { status: string; stage: string; progress: number; error: string | null; downloadUrl: string | null; stats: unknown };
  if (job.stage !== lastStage) {
    console.log(`[${Math.round((Date.now() - started) / 1000)}s] ${job.stage} (${job.progress}%)`);
    lastStage = job.stage;
  }
  if (job.status === "failed") {
    console.error("FAILED:", job.error);
    process.exit(1);
  }
  if (job.status === "done" && job.downloadUrl) {
    const deck = await fetch(job.downloadUrl, { headers: auth });
    const bytes = Buffer.from(await deck.arrayBuffer());
    await writeFile("smoke-deck.pptx", bytes);
    console.log(`downloaded ${bytes.length} bytes -> smoke-deck.pptx`);
    console.log("stats:", JSON.stringify(job.stats, null, 2));
    console.log(`end-to-end: ${Math.round((Date.now() - started) / 1000)}s`);
    break;
  }
}
