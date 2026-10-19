import { NextResponse } from "next/server";
import { authenticateDevice, recordHeartbeat } from "@/lib/devices";
import { MAX_HEARTBEAT_BYTES, parseHeartbeat } from "@/lib/heartbeat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The phone's recording watchdog checks in here (~every 15 min while
// recording, and when the app is opened) so the Devices page can warn when a
// phone goes quiet. Contract: docs/API.md → "POST /api/devices/heartbeat".

export async function POST(req: Request) {
  const device = await authenticateDevice(req);
  if (!device) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (Number(req.headers.get("content-length")) > MAX_HEARTBEAT_BYTES) {
    return NextResponse.json({ error: "too large" }, { status: 413 });
  }
  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_HEARTBEAT_BYTES) {
    return NextResponse.json({ error: "too large" }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = parseHeartbeat(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    await recordHeartbeat(device.id, parsed.status);
  } catch (err) {
    console.error("[/api/devices/heartbeat] failed:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
