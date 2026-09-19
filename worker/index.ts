import { Worker } from "bullmq";
import { updateJob } from "../src/lib/jobs";
import { runDeckJob } from "../src/lib/pipeline";
import { DECK_QUEUE, redisConnection, type DeckJobData } from "../src/lib/queue";

const worker = new Worker<DeckJobData>(
  DECK_QUEUE,
  async (job) => {
    await runDeckJob(job.data.jobId);
  },
  { connection: redisConnection(), concurrency: 2, lockDuration: 120_000 },
);

worker.on("failed", async (job, err) => {
  console.error(`[worker] job ${job?.data.jobId} failed:`, err);
  if (job) {
    await updateJob(job.data.jobId, { status: "failed", stage: "failed", error: err.message.slice(0, 1000) }).catch((e) =>
      console.error("[worker] could not record failure:", e),
    );
  }
});
worker.on("ready", () => console.log(`[worker] listening on queue "${DECK_QUEUE}"`));

async function shutdown() {
  console.log("[worker] shutting down");
  await worker.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
