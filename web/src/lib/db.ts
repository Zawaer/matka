import { Pool, type PoolClient, type QueryResultRow } from "pg";

// Singleton pool across hot reloads in dev. Created lazily so `next build`
// doesn't need a database.
const globalForPg = globalThis as unknown as { _matkaPool?: Pool };

export function pool(): Pool {
  if (!globalForPg._matkaPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL must be set");
    globalForPg._matkaPool = new Pool({ connectionString, max: 10 });
  }
  return globalForPg._matkaPool;
}

/** Run a parameterized query and return typed rows. */
export async function q<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const res = await pool().query<T>(text, params);
  return res.rows;
}

/** Run fn inside a transaction on one connection. */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (err) {
    await c.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    c.release();
  }
}
