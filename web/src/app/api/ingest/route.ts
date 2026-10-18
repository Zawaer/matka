import { NextResponse } from "next/server";
import { q, USER_ID } from "@/lib/db";

export const dynamic = "force-dynamic";

// Ingestion endpoint for the Matka mobile recorder.
//
// Matka only reads the database. Points are forwarded to Dawarich's own
// Overland endpoint, so Dawarich stays the single writer and runs its usual
// processing (reverse geocoding, tracks, visits). Dawarich upserts points,
// so a batch retried after a lost response does not create duplicates.
//
// Body: { points: [{ lat, lon, ts, accuracy?, altitude?, speed?, battery? }] }
//   ts = Unix epoch seconds (or milliseconds), or an ISO string.
// Responds 2xx only once Dawarich has stored the batch; on any other status
// the phone keeps the points and retries later.

type InPoint = {
  lat: number;
  lon: number;
  ts: number | string;
  accuracy?: number | null;
  altitude?: number | null;
  speed?: number | null;
  battery?: number | null;
};

const DAWARICH_URL = (process.env.DAWARICH_URL ?? "http://dawarich_app:3000").replace(/\/$/, "");
const MAX_BATCH = 1000;

function toIso(ts: number | string): string | null {
  const ms =
    typeof ts === "number" ? (ts > 1e12 ? ts : ts * 1000) : Date.parse(ts);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function toOverland(p: InPoint) {
  const lat = Number(p.lat);
  const lon = Number(p.lon);
  const timestamp = toIso(p.ts);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !timestamp) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties: {
      timestamp,
      horizontal_accuracy: p.accuracy ?? undefined,
      altitude: p.altitude ?? undefined,
      speed: p.speed ?? undefined,
      // Overland reports battery as 0..1; Dawarich converts it to a percentage.
      battery_level: p.battery != null ? p.battery / 100 : undefined,
      device_id: "matka-android",
    },
  };
}

export async function POST(req: Request) {
  const apiKey = process.env.DAWARICH_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "DAWARICH_API_KEY is not set" }, { status: 503 });
  }

  let body: { points?: InPoint[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const raw = Array.isArray(body?.points) ? body.points : [];
  if (raw.length > MAX_BATCH) {
    return NextResponse.json({ error: `at most ${MAX_BATCH} points per batch` }, { status: 413 });
  }
  const locations = raw.map(toOverland).filter((l) => l !== null);
  // Malformed points can never succeed; report them as accepted-and-skipped
  // so the phone drops them instead of retrying forever.
  if (locations.length === 0) {
    return NextResponse.json({ forwarded: 0, skipped: raw.length });
  }

  let res: Response;
  try {
    res = await fetch(`${DAWARICH_URL}/api/v1/overland/batches`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ locations }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    console.error("[/api/ingest] Dawarich unreachable:", err);
    return NextResponse.json({ error: "dawarich unreachable" }, { status: 502 });
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    console.error(`[/api/ingest] Dawarich returned ${res.status}: ${detail}`);
    return NextResponse.json({ error: `dawarich returned ${res.status}` }, { status: 502 });
  }
  return NextResponse.json({
    forwarded: locations.length,
    skipped: raw.length - locations.length,
  });
}

export async function GET() {
  // Quick check of what has arrived (read-only).
  const [row] = await q<{ count: string; last: Date | null }>(
    `SELECT count(*) count, to_timestamp(max(timestamp)) last
     FROM points WHERE user_id = $1`,
    [USER_ID],
  );
  return NextResponse.json({ ok: true, points: Number(row?.count ?? 0), last: row?.last ?? null });
}
