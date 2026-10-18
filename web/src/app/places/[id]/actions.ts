"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";

/** Sets (or, when blank, clears) the user's own name for a place. */
export async function renamePlace(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(form.get("id") ?? "");
  if (!/^\d+$/.test(id)) return;
  const name = String(form.get("name") ?? "").trim().slice(0, 120);
  await q(`UPDATE places SET custom_name = $3 WHERE id = $1 AND user_id = $2`, [
    id,
    user.id,
    name || null,
  ]);
  revalidatePath(`/places/${id}`);
  revalidatePath("/places");
}
