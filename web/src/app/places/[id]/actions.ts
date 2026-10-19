"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { markAllDirty } from "@/lib/places";
import { DEFAULT_RADIUS_M, isPlaceKind, parseRadius } from "@/lib/savedPlaces";

const cleanName = (v: FormDataEntryValue | null) => String(v ?? "").trim().slice(0, 120) || null;

function refresh(id: string) {
  revalidatePath(`/places/${id}`);
  revalidatePath("/places");
  revalidatePath("/insights", "layout");
}

/** Sets (or, when blank, clears) the user's own name for a place. */
export async function renamePlace(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(form.get("id") ?? "");
  if (!/^\d+$/.test(id)) return;
  await q(`UPDATE places SET custom_name = $3 WHERE id = $1 AND user_id = $2`, [id, user.id, cleanName(form.get("name"))]);
  refresh(id);
}

/**
 * Saves a place with a kind and size (and its name). Saving, or changing the
 * size, changes which visits belong to it: the history is reprocessed.
 */
export async function savePlace(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(form.get("id") ?? "");
  const kind = form.get("kind");
  const radius = parseRadius(form.get("radius") ?? DEFAULT_RADIUS_M);
  if (!/^\d+$/.test(id) || !isPlaceKind(kind) || radius == null) return;
  const [before] = await q<{ radius_m: number | null; kind: string | null }>(
    `SELECT radius_m, kind FROM places WHERE id = $1 AND user_id = $2`,
    [id, user.id],
  );
  if (!before) return;
  await q(
    `UPDATE places SET custom_name = $3, kind = $4, radius_m = $5, saved_at = COALESCE(saved_at, now())
     WHERE id = $1 AND user_id = $2`,
    [id, user.id, cleanName(form.get("name")), kind, radius],
  );
  if (before.kind == null || before.radius_m !== radius) await markAllDirty(user.id);
  refresh(id);
}

/** Makes a saved place an ordinary one again (its name stays). */
export async function unsavePlace(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(form.get("id") ?? "");
  if (!/^\d+$/.test(id)) return;
  const rows = await q(
    `UPDATE places SET kind = NULL, radius_m = NULL, saved_at = NULL
     WHERE id = $1 AND user_id = $2 AND kind IS NOT NULL RETURNING id`,
    [id, user.id],
  );
  if (rows.length) await markAllDirty(user.id);
  refresh(id);
}
