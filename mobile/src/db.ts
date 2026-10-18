// Durable on-device storage: the point queue and a small key/value state table.
// Both the background task and the UI use this module; SQLite serialises access.

import * as SQLite from "expo-sqlite";
import type { QueuedPoint } from "./points";

/** Oldest points are discarded beyond this, so storage can't grow without bound (~200k ≈ 3 months at Balanced). */
export const QUEUE_CAP = 200_000;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function db(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const d = await SQLite.openDatabaseAsync("matka.db");
      await d.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ts INTEGER NOT NULL,
          lat REAL NOT NULL,
          lon REAL NOT NULL,
          accuracy REAL,
          altitude REAL,
          speed REAL,
          battery INTEGER
        );
        CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY NOT NULL, v TEXT);
      `);
      return d;
    })().catch((e) => {
      dbPromise = null; // let the next call retry
      throw e;
    });
  }
  return dbPromise;
}

// ---- Queue -----------------------------------------------------------------

const COLS = 7;
const ROWS_PER_INSERT = 100; // 700 bound params, well under SQLite's limit

/** Appends points and trims the oldest beyond QUEUE_CAP. Returns how many were trimmed. */
export async function enqueue(points: QueuedPoint[]): Promise<number> {
  if (points.length === 0) return 0;
  const d = await db();
  for (let i = 0; i < points.length; i += ROWS_PER_INSERT) {
    const chunk = points.slice(i, i + ROWS_PER_INSERT);
    const placeholders = chunk.map(() => `(${Array(COLS).fill("?").join(",")})`).join(",");
    const params = chunk.flatMap((p) => [p.ts, p.lat, p.lon, p.accuracy, p.altitude, p.speed, p.battery]);
    await d.runAsync(
      `INSERT INTO queue (ts, lat, lon, accuracy, altitude, speed, battery) VALUES ${placeholders}`,
      params,
    );
  }
  return trim();
}

async function trim(): Promise<number> {
  const d = await db();
  const n = await count();
  if (n <= QUEUE_CAP) return 0;
  const excess = n - QUEUE_CAP;
  await d.runAsync(`DELETE FROM queue WHERE id IN (SELECT id FROM queue ORDER BY id LIMIT ?)`, [excess]);
  const prev = Number((await getKv("dropped_overflow")) ?? 0);
  await setKv("dropped_overflow", String(prev + excess));
  return excess;
}

export async function peek(limit: number): Promise<QueuedPoint[]> {
  const d = await db();
  return d.getAllAsync<QueuedPoint>(
    `SELECT id, ts, lat, lon, accuracy, altitude, speed, battery FROM queue ORDER BY id LIMIT ?`,
    [limit],
  );
}

export async function remove(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const d = await db();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    await d.runAsync(`DELETE FROM queue WHERE id IN (${chunk.map(() => "?").join(",")})`, chunk);
  }
}

export async function count(): Promise<number> {
  const d = await db();
  const r = await d.getFirstAsync<{ n: number }>(`SELECT count(*) AS n FROM queue`);
  return r?.n ?? 0;
}

export async function oldestTs(): Promise<number | null> {
  const d = await db();
  const r = await d.getFirstAsync<{ ts: number | null }>(`SELECT min(ts) AS ts FROM queue`);
  return r?.ts ?? null;
}

export async function clearQueue(): Promise<void> {
  const d = await db();
  await d.runAsync(`DELETE FROM queue`);
}

// ---- Key/value state -------------------------------------------------------

export async function getKv(k: string): Promise<string | null> {
  const d = await db();
  const r = await d.getFirstAsync<{ v: string | null }>(`SELECT v FROM kv WHERE k = ?`, [k]);
  return r?.v ?? null;
}

export async function setKv(k: string, v: string | null): Promise<void> {
  const d = await db();
  if (v == null) await d.runAsync(`DELETE FROM kv WHERE k = ?`, [k]);
  else await d.runAsync(`INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`, [k, v]);
}

export async function getAllKv(): Promise<Record<string, string>> {
  const d = await db();
  const rows = await d.getAllAsync<{ k: string; v: string }>(`SELECT k, v FROM kv`);
  return Object.fromEntries(rows.map((r) => [r.k, r.v]));
}

export const getNum = async (k: string): Promise<number | null> => {
  const v = await getKv(k);
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
};
export const setNum = (k: string, n: number | null) => setKv(k, n == null ? null : String(n));
