import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { deviceOrSessionUser } from "@/lib/auth";
import { parsePlaceChoice, savePlaceChoice } from "@/lib/placeConfirm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/places/:id/confirm — the answer to "Visited X?" on the timeline:
 * {confirm: true} keeps the shown name; {name, category?} names the place
 * (one of its candidates, or a name the user typed). Either way the place is
 * not asked about again. Browser session or device token.
 */
export async function POST(req: Request, { params }: Ctx) {
  const user = await deviceOrSessionUser(req);
  if (user instanceof NextResponse) return user;
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "bad id" }, { status: 400 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  const choice = parsePlaceChoice(body);
  if ("error" in choice) return NextResponse.json(choice, { status: 400 });
  try {
    if (!(await savePlaceChoice(user.id, id, choice))) return NextResponse.json({ error: "not found" }, { status: 404 });
  } catch (err) {
    console.error("[/api/places/confirm] failed:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  revalidatePath(`/places/${id}`);
  revalidatePath("/places");
  return NextResponse.json({ ok: true });
}
