import { Pool } from "pg";
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

export function toVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}
