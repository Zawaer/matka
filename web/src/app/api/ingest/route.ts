import { NextResponse } from "next/server";
import { pool, q, USER_ID } from "@/lib/db";
import { authenticateDevice } from "@/lib/devices";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Ingestion endpoint for paired Matka collectors. The full contract (auth,
// limits, response codes, idempotency) is in docs/API.md — keep them in sync.

const MAX_POINTS = 1000;
const MAX_BYTES = 1024 * 1024;
// Fixes from before smartphones existed, or from the future, are bogus.
const MIN_TS = Date.UTC(2000, 0, 1) / 1000;
const MAX_FUTURE_S = 24 * 60 * 60;

const unauthorized = () => NextResponse.json({ error: "unauthorized" }, { status: 401 });
const tooLarge = () => NextResponse.json({ error: "too large" }, { status: 413 });
const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });

type Row = {
  lon: number;
  lat: number;
  ts: number;
  accuracy: number | null;
  altitude: number | null;
  speed: string | null;
  battery: number | null;
};

function toEpochSeconds(ts: unknown): number | null {
  let s: number;
  if (typeof ts === "number" && Number.isFinite(ts)) s = ts > 1e12 ? ts / 1000 : ts;
  else if (typeof ts === "string") s = Date.parse(ts) / 1000;
  else return null;
  s = Math.floor(s);
  return Number.isFinite(s) && s >= MIN_TS && s <= Date.now() / 1000 + MAX_FUTURE_S ? s : null;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Validates one fix. Required fields must be valid; bad optional fields become null. */
function parsePoint(p: unknown): Row | null {
  if (typeof p !== "object" || p === null) return null;
  const { lat, lon, ts, accuracy, altitude, speed, battery } = p as Record<string, unknown>;
  if (!finite(lat) || lat < -90 || lat > 90) return null;
  if (!finite(lon) || lon < -180 || lon > 180) return null;
  const t = toEpochSeconds(ts);
  if (t == null) return null;
  // accuracy/altitude/battery are integer columns; Android reports floats.
  return {
    lat,
    lon,
    ts: t,
    accuracy: finite(accuracy) && accuracy >= 0 ? Math.round(accuracy) : null,
    altitude: finite(altitude) ? Math.round(altitude) : null,
    speed: finite(speed) && speed >= 0 ? String(speed) : null,
    battery: finite(battery) && battery >= 0 && battery <= 100 ? Math.round(battery) : null,
  };
}

/** Reads the body as text, giving up as soon as it exceeds MAX_BYTES. */
async function readCapped(req: Request): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"));
  if (declared > MAX_BYTES) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function POST(req: Request) {
  const device = await authenticateDevice(req);
  if (!device) return unauthorized();

  const text = await readCapped(req);
  if (text == null) return tooLarge();

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return badRequest("invalid json");
  }
  const points = (body as { points?: unknown } | null)?.points;
  if (!Array.isArray(points)) return badRequest("expected {\"points\": [...]}");
  if (points.length > MAX_POINTS) return tooLarge();

  // Keep the first fix per timestamp; the rest of the batch counts as duplicates.
  const rows = new Map<number, Row>();
  let valid = 0;
  for (const p of points) {
    const row = parsePoint(p);
    if (!row) continue;
    valid++;
    if (!rows.has(row.ts)) rows.set(row.ts, row);
  }

  let inserted = 0;
  if (rows.size > 0) {
    const r = [...rows.values()];
    const conn = await pool.connect();
    try {
      await conn.query("BEGIN");
      // Serialize ingests per user so concurrent retries of one batch can't
      // both pass the NOT EXISTS check (points has no unique key we can use).
      await conn.query("SELECT pg_advisory_xact_lock(hashtext('matka_ingest'), $1::int)", [
        USER_ID,
      ]);
      const res = await conn.query(
        `INSERT INTO points
           (user_id, lonlat, timestamp, accuracy, altitude, velocity, battery, created_at, updated_at)
         SELECT $1, ST_SetSRID(ST_MakePoint(t.lon, t.lat), 4326)::geography,
                t.ts, t.accuracy, t.altitude, t.speed, t.battery, now(), now()
         FROM unnest($2::float8[], $3::float8[], $4::int4[], $5::int4[], $6::int4[], $7::text[], $8::int4[])
           AS t(lon, lat, ts, accuracy, altitude, speed, battery)
         WHERE NOT EXISTS (
           SELECT 1 FROM points p WHERE p.user_id = $1 AND p.timestamp = t.ts
         )`,
        [
          USER_ID,
          r.map((x) => x.lon),
          r.map((x) => x.lat),
          r.map((x) => x.ts),
          r.map((x) => x.accuracy),
          r.map((x) => x.altitude),
          r.map((x) => x.speed),
          r.map((x) => x.battery),
        ],
      );
      await conn.query("COMMIT");
      inserted = res.rowCount ?? 0;
    } catch (err) {
      await conn.query("ROLLBACK").catch(() => {});
      console.error("[/api/ingest] insert failed:", err);
      return NextResponse.json({ error: "internal" }, { status: 500 });
    } finally {
      conn.release();
    }
  }

  return NextResponse.json({
    received: points.length,
    inserted,
    duplicates: valid - inserted,
    rejected: points.length - valid,
  });
}

export async function GET(req: Request) {
  const device = await authenticateDevice(req);
  if (!device) return unauthorized();

  const [row] = await q<{ count: string; last: Date | null }>(
    `SELECT count(*) count, to_timestamp(max(timestamp)) last
     FROM points WHERE user_id = $1`,
    [USER_ID],
  );
  return NextResponse.json({
    ok: true,
    device: device.name,
    points: Number(row.count),
    last: row.last,
  });
}
