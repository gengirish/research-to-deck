export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * fetch with a timeout and exponential backoff on 429 / 5xx / network errors.
 * Honours Retry-After when the server sends one.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  { retries = 5, timeoutMs = 30_000, baseDelayMs = 1_000 } = {},
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (res.status !== 429 && res.status < 500) return res;
      lastError = new HttpError(`${res.status} from ${new URL(url).host}`, res.status);
      const retryAfter = Number(res.headers.get("retry-after"));
      if (attempt < retries) {
        await sleep(retryAfter > 0 ? retryAfter * 1000 : baseDelayMs * 2 ** attempt);
      }
    } catch (err) {
      lastError = err;
      if (attempt < retries) await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  throw lastError;
}

/** Runs async work over items with a fixed concurrency limit, preserving order. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
