import { NextResponse } from "next/server";
import { q, USER_ID } from "@/lib/db";

export const dynamic = "force-dynamic";

// Minimal ingestion endpoint for the Matka mobile collector (Expo spike).
// Accepts a batch of locations and inserts them as points (user_id = USER_ID),
// so collected points show up on the map/timeline immediately.
//
// Body: { points: [{ lat, lon, ts, accuracy?, altitude?, speed?, battery? }] }
//   ts = Unix epoch SECONDS (number) or ISO string.

type InPoint = {
  lat: number;
  lon: number;
  ts: number | string;
  accuracy?: number | null;
  altitude?: number | null;
  speed?: number | null;
  battery?: number | null;
};

function toEpochSeconds(ts: number | string): number | null {
  if (typeof ts === "number") return ts > 1e12 ? Math.floor(ts / 1000) : Math.floor(ts);
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

// accuracy/altitude/battery are integer columns; Android reports floats.
function toInt(v: number | null | undefined): number | null {
  return v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v));
}

export async function POST(req: Request) {
  let body: { points?: InPoint[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const points = Array.isArray(body?.points) ? body.points : [];
  if (points.length === 0) return NextResponse.json({ inserted: 0 });

  let inserted = 0;
  for (const p of points) {
    const lat = Number(p.lat);
    const lon = Number(p.lon);
    const ts = toEpochSeconds(p.ts);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || ts == null) continue;
    try {
      await q(
        `INSERT INTO points
           (user_id, lonlat, timestamp, accuracy, altitude, velocity, battery, created_at, updated_at)
         VALUES
           ($1, ST_SetSRID(ST_MakePoint($2,$3),4326)::geography, $4, $5, $6, $7, $8, now(), now())`,
        [
          USER_ID,
          lon,
          lat,
          ts,
          toInt(p.accuracy),
          toInt(p.altitude),
          p.speed != null ? String(p.speed) : null,
          toInt(p.battery),
        ],
      );
      inserted++;
    } catch (err) {
      console.error("[/api/ingest] insert failed:", err);
    }
  }
  return NextResponse.json({ inserted, received: points.length });
}

export async function GET() {
  // Quick health/count check.
  const [row] = await q<{ count: string; last: Date | null }>(
    `SELECT count(*) count, to_timestamp(max(timestamp)) last
     FROM points WHERE user_id = $1`,
    [USER_ID],
  );
  return NextResponse.json({ ok: true, points: Number(row.count), last: row.last });
}
