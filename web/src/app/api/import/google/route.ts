import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { listImports, removeGooglePoints, startUpload } from "@/lib/google/import";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/import/google — this user's Google imports, newest first. */
export async function GET() {
  const user = await apiUser();
  if (user instanceof NextResponse) return user;
  return NextResponse.json({ imports: await listImports(user.id) });
}

/** POST /api/import/google {files: [{name, size}]} — starts an upload; returns {id}. */
export async function POST(req: Request) {
  const user = await apiUser();
  if (user instanceof NextResponse) return user;
  const body = (await req.json().catch(() => null)) as { files?: { name: string; size: number }[] } | null;
  const r = await startUpload(user.id, body?.files ?? []);
  if ("error" in r) return NextResponse.json(r, { status: 400 });
  return NextResponse.json(r);
}

/** DELETE /api/import/google — removes every point Google imports added. */
export async function DELETE() {
  const user = await apiUser();
  if (user instanceof NextResponse) return user;
  try {
    return NextResponse.json({ removed: await removeGooglePoints(user.id) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 409 });
  }
}
