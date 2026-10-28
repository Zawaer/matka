import { NextResponse } from "next/server";
import { deviceOrSessionUser } from "@/lib/auth";
import { deleteCorrection } from "@/lib/corrections";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/corrections/:id — undo a fix: the trip shows what was detected again. */
export async function DELETE(req: Request, { params }: Ctx) {
  const user = await deviceOrSessionUser(req);
  if (user instanceof NextResponse) return user;
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "bad id" }, { status: 400 });
  return (await deleteCorrection(user.id, id))
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "not found" }, { status: 404 });
}
