import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { env } from "./env";

export const DECK_QUEUE = "decks";

export interface DeckJobData {
  jobId: string;
}

/**
 * BullMQ 6 treats ioredis as optional and, under native ESM, needs a constructed client.
 * REDIS_URL may be redis:// or rediss:// (TLS, e.g. Upstash).
 */
export function redisConnection(): Redis {
  return new Redis(env.redisUrl, { maxRetriesPerRequest: null });
}

const globalForQueue = globalThis as unknown as { deckQueue?: Queue<DeckJobData> };

export function getDeckQueue(): Queue<DeckJobData> {
  if (!globalForQueue.deckQueue) {
    globalForQueue.deckQueue = new Queue<DeckJobData>(DECK_QUEUE, { connection: redisConnection() });
  }
  return globalForQueue.deckQueue;
}
