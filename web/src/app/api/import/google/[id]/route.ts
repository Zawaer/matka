import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { CHUNK_MAX, appendChunk, finishUpload, uploadStatus } from "@/lib/google/import";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/import/google/:id — status and progress of one import. */
export async function GET(_req: Request, { params }: Ctx) {
  const user = await apiUser();
  if (user instanceof NextResponse) return user;
  const s = await uploadStatus(user.id, (await params).id);
  return s ? NextResponse.json(s) : NextResponse.json({ error: "not found" }, { status: 404 });
}

/**
 * PUT /api/import/google/:id?file=<index>&offset=<bytes> — one chunk of a file
 * (application/octet-stream, at most CHUNK_MAX bytes, below the proxy's body buffer).
 */
export async function PUT(req: Request, { params }: Ctx) {
  const user = await apiUser();
  if (user instanceof NextResponse) return user;
  const sp = new URL(req.url).searchParams;
  const index = Number(sp.get("file"));
  const offset = Number(sp.get("offset"));
  if (!Number.isInteger(index) || !Number.isSafeInteger(offset) || offset < 0) {
    return NextResponse.json({ error: "bad file or offset" }, { status: 400 });
  }
  if (Number(req.headers.get("content-length") ?? 0) > CHUNK_MAX) {
    return NextResponse.json({ error: "chunk too large" }, { status: 413 });
  }
  const data = new Uint8Array(await req.arrayBuffer());
  const r = await appendChunk(user.id, (await params).id, index, offset, data);
  if (!r.ok) return NextResponse.json({ error: r.error, size: r.size }, { status: r.status });
  return NextResponse.json({ size: r.size });
}

/** POST /api/import/google/:id — all chunks sent: start importing. */
export async function POST(_req: Request, { params }: Ctx) {
  const user = await apiUser();
  if (user instanceof NextResponse) return user;
  const r = await finishUpload(user.id, (await params).id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true }, { status: 202 });
}
