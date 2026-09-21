import { Pool, type PoolClient } from "pg";
import { env } from "./env";

const globalForPool = globalThis as unknown as { pgPool?: Pool };

export function getPool(): Pool {
  if (!globalForPool.pgPool) {
    const url = env.databaseUrl;
    const isLocal = /localhost|127\.0\.0\.1/.test(url);
    globalForPool.pgPool = new Pool({
      connectionString: url,
      max: 5,
      ssl: isLocal ? undefined : { rejectUnauthorized: false },
    });
  }
  return globalForPool.pgPool;
}

/** A pool or a checked-out client, so a helper can run inside someone else's transaction. */
export type Queryable = Pick<Pool, "query"> | PoolClient;

/** Runs `fn` in one transaction, rolling back on any throw. */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export function toVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}
