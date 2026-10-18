import { Pool, type QueryResultRow } from "pg";

// Singleton pool across hot reloads in dev.
const globalForPg = globalThis as unknown as { _matkaPool?: Pool };

export const pool =
  globalForPg._matkaPool ??
  new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://matka:matka@localhost:5544/matka",
    max: 8,
  });

if (process.env.NODE_ENV !== "production") globalForPg._matkaPool = pool;

/** Run a parameterized query and return typed rows. */
export async function q<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const res = await pool.query<T>(text, params);
  return res.rows;
}

/** The single user this instance serves (Dawarich snapshot is single-user). */
export const USER_ID = Number(process.env.MATKA_USER_ID ?? 1);
