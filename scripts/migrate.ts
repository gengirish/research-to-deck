import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { getPool } from "../src/lib/db";

// Migrations are idempotent (IF NOT EXISTS), so re-running is safe.
const dir = path.resolve(process.cwd(), "db", "migrations");
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
const pool = getPool();
for (const file of files) {
  await pool.query(await readFile(path.join(dir, file), "utf8"));
  console.log(`applied ${file}`);
}
await pool.end();
