import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { authenticateDevice } from "@/lib/devices";
import { MAX_BYTES, MAX_POINTS, parseBatch } from "@/lib/ingest";
import { insertPoints } from "@/lib/points";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Ingestion endpoint for paired Matka collectors. The full contract (auth,
// limits, response codes, idempotency) is in docs/API.md — keep them in sync.

const unauthorized = () => NextResponse.json({ error: "unauthorized" }, { status: 401 });
const tooLarge = () => NextResponse.json({ error: "too large" }, { status: 413 });
const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });

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

  const { fixes, valid, rejected } = parseBatch(points);
  let inserted = 0;
  try {
    inserted = await insertPoints(device.userId, fixes, { deviceId: device.id, source: "device" });
  } catch (err) {
    console.error("[/api/ingest] insert failed:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  return NextResponse.json({
    received: points.length,
    inserted,
    duplicates: valid - inserted,
    rejected,
  });
}

export async function GET(req: Request) {
  const device = await authenticateDevice(req);
  if (!device) return unauthorized();

  const [row] = await q<{ count: string; last: Date | null }>(
    `SELECT count(*) count, max(ts) last FROM points WHERE user_id = $1`,
    [device.userId],
  );
  return NextResponse.json({
    ok: true,
    device: device.name,
    points: Number(row.count),
    last: row.last,
  });
}
