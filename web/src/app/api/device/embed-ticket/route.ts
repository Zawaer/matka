import { NextResponse } from "next/server";
import { appUrl } from "@/lib/appUrl";
import { authenticateDevice } from "@/lib/devices";
import { signTicket } from "@/lib/embed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST with the device bearer token → a one-minute URL for the app's map WebView.
export async function POST(req: Request) {
  const device = await authenticateDevice(req);
  if (!device) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ticket = await signTicket({ userId: device.userId, deviceId: device.id });
  return NextResponse.json(
    { url: `${appUrl()}/embed/start?ticket=${encodeURIComponent(ticket)}` },
    { headers: { "cache-control": "no-store" } },
  );
}
